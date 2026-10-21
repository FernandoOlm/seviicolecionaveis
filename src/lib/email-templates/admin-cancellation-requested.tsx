import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import * as React from 'react'
import { Heading, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, styles, SITE_URL, formatBRL } from './_shared'

interface AdminCancellationRequestedProps {
  orderId?: string
  recipientName?: string
  customerEmail?: string
  totalCents?: number
  preCancelStatus?: string
}

const STATUS_LABEL = ORDER_STATUS_LABELS;

const AdminCancellationRequestedEmail: React.FC<AdminCancellationRequestedProps> = ({
  orderId,
  recipientName,
  customerEmail,
  totalCents,
  preCancelStatus,
}) => {
  const shortId = orderId ? `#${orderId.slice(0, 8).toUpperCase()}` : ''
  const prevLabel = (preCancelStatus && STATUS_LABEL[preCancelStatus]) || preCancelStatus || '—'
  return (
    <EmailLayout preview={`Cliente solicitou cancelamento do pedido ${shortId}`}>
      <Heading style={styles.h1}>Solicitação de cancelamento</Heading>
      <Text style={styles.text}>
        O cliente <strong>{recipientName ?? 'Cliente'}</strong> solicitou o cancelamento
        do pedido <strong>{shortId}</strong>. É necessário revisar e aprovar ou recusar.
      </Text>

      <Section style={styles.card}>
        <Text style={{ ...styles.muted, margin: '0 0 4px' }}>Pedido</Text>
        <Text style={{ ...styles.text, margin: '0 0 12px' }}>{shortId}</Text>

        <Text style={{ ...styles.muted, margin: '0 0 4px' }}>Cliente</Text>
        <Text style={{ ...styles.text, margin: '0 0 12px' }}>
          {recipientName ?? 'Cliente'}{customerEmail ? ` · ${customerEmail}` : ''}
        </Text>

        <Text style={{ ...styles.muted, margin: '0 0 4px' }}>Status anterior</Text>
        <Text style={{ ...styles.text, margin: '0 0 12px' }}>{prevLabel}</Text>

        {typeof totalCents === 'number' && (
          <>
            <Text style={{ ...styles.muted, margin: '0 0 4px' }}>Total</Text>
            <Text style={{ ...styles.text, margin: 0 }}>{formatBRL(totalCents)}</Text>
          </>
        )}
      </Section>

      <Text style={styles.muted}>
        Revise a solicitação em{' '}
        <a href={`${SITE_URL}/admin?focus=${orderId ?? ''}`} style={{ color: '#111', fontWeight: 600 }}>
          painel admin → pedidos
        </a>.
      </Text>
    </EmailLayout>
  )
}

export const template = {
  component: AdminCancellationRequestedEmail,
  subject: (data: Record<string, any>) => {
    const id = typeof data.orderId === 'string' ? `#${data.orderId.slice(0, 8).toUpperCase()}` : ''
    return `[Admin] Cancelamento solicitado — pedido ${id}`.trim()
  },
  displayName: 'Admin: cancelamento solicitado',
  to: 'seviicolecionaveis@gmail.com',
  previewData: {
    orderId: '7f3e8c12-aaaa-bbbb-cccc-ddddeeeeffff',
    recipientName: 'Ash Ketchum',
    customerEmail: 'ash@pallet.town',
    totalCents: 12990,
    preCancelStatus: 'paid',
  },
} satisfies TemplateEntry
