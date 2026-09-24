import * as React from 'react'
import { render } from '@react-email/render'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { sendTemplateEmail } from '@/lib/email-templates/send-email'

const SITE_NAME = 'Sevii Colecionáveis'
const FROM_DOMAIN = 'seviicolecionaveis.com.br'

function redactEmail(email: string | null | undefined): string {
  if (!email) return '***'
  const [l, d] = email.split('@')
  if (!l || !d) return '***'
  return `${l[0]}***@${d}`
}

export interface SendTransactionalParams {
  templateName: string
  recipientEmail: string
  idempotencyKey?: string
  templateData?: Record<string, any>
  batchId?: string
}

/**
 * Server-side helper to send a transactional email through Lovable's managed
 * email API. Use from server functions, webhooks, and other trusted server
 * contexts. Delivery, retries, rate limits, suppression and unsubscribe are
 * handled by Lovable; this wrapper only records the app's own send log rows.
 */
export async function sendTransactionalEmailServer(
  params: SendTransactionalParams,
): Promise<{ success: boolean; reason?: string; error?: string }> {
  const { templateName, recipientEmail, templateData = {} } = params
  const messageId = crypto.randomUUID()
  const idempotencyKey = params.idempotencyKey || messageId

  const supabase = supabaseAdmin as any

  const template = TEMPLATES[templateName]
  if (!template) {
    console.error('[email] Template not found', { templateName })
    return { success: false, error: 'template_not_found' }
  }

  const effectiveRecipient = template.to || recipientEmail
  if (!effectiveRecipient) {
    return { success: false, error: 'missing_recipient' }
  }
  // Contas criadas pelo bot do WhatsApp usam um login interno que não é uma caixa de e-mail real.
  if (effectiveRecipient.toLowerCase().endsWith('@whatsapp.seviicolecionaveis.com.br')) {
    return { success: false, reason: 'placeholder_recipient' }
  }

  // Render once for the app's own log row (subject/body preview in admin).
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  const fromValue = `${SITE_NAME} <noreply@${FROM_DOMAIN}>`

  const logRow = (
    status: string,
    extra: Record<string, any> = {},
  ) => ({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status,
    metadata: { idempotency_key: idempotencyKey },
    subject: resolvedSubject,
    body_html: html,
    from_email: fromValue,
    batch_id: params.batchId ?? null,
    ...extra,
  })

  try {
    let result
    try {
      result = await sendTemplateEmail(templateName, effectiveRecipient, {
        templateData,
        idempotencyKey,
      })
    } catch (e: any) {
      // Limite de envio: só tenta de novo se a espera for curta. Nunca segurar
      // o checkout/pagamento esperando minutos pelo serviço de e-mail.
      const waitSeconds =
        typeof e?.retryAfterSeconds === 'number' ? e.retryAfterSeconds : 60
      if (e?.status === 429 && waitSeconds <= 3) {
        await new Promise((r) => setTimeout(r, waitSeconds * 1000))
        result = await sendTemplateEmail(templateName, effectiveRecipient, {
          templateData,
          idempotencyKey,
        })
      } else {
        throw e
      }
    }


    if (!result.sent) {
      const { error } = await supabase
        .from('email_send_log')
        .insert(logRow('suppressed'))
      if (error) console.error('[email] Failed to log suppressed send', error)
      return { success: false, reason: 'email_suppressed' }
    }

    const { error } = await supabase.from('email_send_log').insert(logRow('sent'))
    if (error) console.error('[email] Failed to log sent email', error)

    console.log('[email] Sent', {
      templateName,
      recipient: redactEmail(effectiveRecipient),
    })
    return { success: true }
  } catch (e: any) {
    const message = e?.message ? String(e.message).slice(0, 500) : 'send_failed'
    const { error } = await supabase
      .from('email_send_log')
      .insert(logRow('failed', { error_message: message }))
    if (error) console.error('[email] Failed to log failed send', error)
    console.error('[email] Send failed', { templateName, message })
    return { success: false, error: 'send_failed' }
  }
}

/**
 * Fire-and-forget wrapper: catches errors so a failed email never breaks
 * the main flow (order creation, payment processing, etc.).
 */
export async function sendTransactionalEmailSafe(params: SendTransactionalParams) {
  try {
    return await sendTransactionalEmailServer(params)
  } catch (e) {
    console.error('[email] Unexpected error', e)
    return { success: false, error: 'unexpected' }
  }
}
