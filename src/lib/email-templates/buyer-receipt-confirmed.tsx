import * as React from 'react'
import { Heading, Text, Link } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, styles, SITE_URL } from './_shared'

interface Props { orderId?: string; recipientName?: string; customerEmail?: string; confirmedAt?: string; userId?: string }
function BuyerReceiptConfirmed({ orderId, recipientName, customerEmail, confirmedAt, userId }: Props) {
  const shortId = orderId ? `#${orderId.slice(0, 8).toUpperCase()}` : ''
  const date = confirmedAt ? new Date(confirmedAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }) : '—'
  return <EmailLayout preview={`Recebimento confirmado pelo comprador — ${shortId}`}>
    <Heading style={styles.h1}>Recebimento confirmado</Heading>
    <Text style={styles.text}>{recipientName || 'O comprador'} confirmou que recebeu todos os itens do pedido {shortId}. O status foi atualizado para Entregue.</Text>
    <Text style={styles.text}>Cliente: {recipientName || 'Cliente'}{customerEmail ? ` · ${customerEmail}` : ''}<br />Confirmado em: {date} (Fortaleza)<br />Usuário: {userId || '—'}</Text>
    <Link href={`${SITE_URL}/admin/orders/${orderId || ''}`} style={styles.text}>Ver pedido no painel</Link>
  </EmailLayout>
}
export const template = {
  component: BuyerReceiptConfirmed,
  subject: (data: Record<string, unknown>) => `Recebimento confirmado — pedido #${typeof data.orderId === 'string' ? data.orderId.slice(0, 8).toUpperCase() : ''}`,
  displayName: 'Loja: recebimento confirmado pelo comprador',
  previewData: { recipientName: 'Cliente', orderId: '12345678-aaaa-aaaa-aaaa-123456789abc', confirmedAt: '2026-10-22T01:15:00Z' },
} satisfies TemplateEntry