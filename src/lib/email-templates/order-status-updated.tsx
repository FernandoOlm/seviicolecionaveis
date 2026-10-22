import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import * as React from 'react'
import { Heading, Section, Text, Button } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, styles, SITE_URL } from './_shared'

interface PartialCancellation {
  itemName?: string
  quantity?: number
  refundCents?: number
  refundMethod?: 'mercadopago' | 'coupon' | 'manual'
  couponCode?: string | null
  adminNote?: string | null
}

interface CancelledItem {
  name?: string
  quantity?: number
}

interface FullCancellation {
  items?: CancelledItem[]
  refundCents?: number
  refundMethod?: 'mercadopago' | 'coupon' | 'manual' | 'none'
  couponCode?: string | null
}

interface OrderStatusUpdatedProps {
  recipientName?: string
  orderId?: string
  status?: string
  trackingCode?: string | null
  carrier?: 'correios' | 'latam' | 'pickup' | null
  trackingUrl?: string | null
  partialCancellation?: PartialCancellation | null
  cancellation?: FullCancellation | null
}


const fmtBRL = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const REFUND_METHOD_LABEL: Record<string, string> = {
  mercadopago: 'estorno automático no Mercado Pago (cai em até 7 dias úteis)',
  coupon: 'cupom de desconto para uso futuro',
  manual: 'estorno manual (entraremos em contato)',
}

const STATUS_LABEL = ORDER_STATUS_LABELS;

const STATUS_MESSAGE: Record<string, string> = {
  pending: 'Seu pedido está aguardando a confirmação do pagamento.',
  paid: 'O pagamento do seu pedido foi confirmado e ele já está em preparação.',
  preparing: 'Seu pedido está sendo preparado para envio.',
  separated: 'Seu pedido foi separado.',
  cards_pending_delivery: 'Ainda faltam cartas a serem entregues no seu pedido. Acompanhe as próximas atualizações.',
  shipped: 'Seu pedido foi enviado! Em breve chega aí.',
  awaiting_pickup: 'Seu pedido está pronto para retirada no local combinado.',
  delivered: 'Seu pedido foi entregue. Esperamos que goste! 🎉',
  cancelled: 'Seu pedido foi cancelado. Se tiver dúvidas, fala com a gente.',
  cancellation_requested: 'Recebemos sua solicitação de cancelamento e vamos analisar em breve.',
}

const CORREIOS_URL = 'https://rastreamento.correios.com.br/app/index.php'

const OrderStatusUpdatedEmail: React.FC<OrderStatusUpdatedProps> = ({
  recipientName,
  orderId,
  status,
  trackingCode,
  carrier,
  trackingUrl,
  partialCancellation,
  cancellation,

}) => {
  const shortId = orderId ? `#${orderId.slice(0, 8).toUpperCase()}` : ''
  const label = (status && STATUS_LABEL[status]) || status || 'Atualizado'
  const msg =
    (status && STATUS_MESSAGE[status]) ||
    'Houve uma atualização no status do seu pedido.'
  const isPickup = carrier === 'pickup'
  const showTracking = status === 'shipped' && !isPickup && trackingCode
  const carrierLabel = carrier === 'latam' ? 'Latam Cargo' : 'Correios'
  const trackUrl = trackingUrl || CORREIOS_URL

  return (
    <EmailLayout preview={`Pedido ${shortId}: ${label}`}>
      <Heading style={styles.h1}>
        {recipientName ? `Olá, ${recipientName}!` : 'Olá!'}
      </Heading>
      <Text style={styles.text}>
        Seu pedido <strong>{shortId}</strong> teve uma atualização de status.
      </Text>

      <Section style={styles.card}>
        <Text style={{ ...styles.muted, margin: '0 0 8px' }}>Novo status</Text>
        <Text style={{ margin: '0 0 12px' }}>
          <span style={styles.badge}>{label}</span>
        </Text>
        <Text style={{ ...styles.text, margin: 0 }}>{msg}</Text>

        {status === 'shipped' && isPickup && (
          <Text style={{ ...styles.text, margin: '16px 0 0' }}>
            Modalidade: <strong>Retirado em mãos</strong>
          </Text>
        )}

        {showTracking && (
          <>
            <Text style={{ ...styles.muted, margin: '16px 0 4px' }}>
              Transportadora: <strong>{carrierLabel}</strong>
            </Text>
            <Text style={{ ...styles.muted, margin: '8px 0 4px' }}>Código de rastreio</Text>
            <Text style={{ ...styles.text, margin: '0 0 12px', fontFamily: 'monospace', fontWeight: 600 }}>
              {trackingCode}
            </Text>
            <Button href={trackUrl} style={{ background: '#111', color: '#fff', padding: '10px 18px', borderRadius: 6, fontWeight: 600, fontSize: 13 }}>
              Rastrear na {carrierLabel}
            </Button>
          </>
        )}
      </Section>

      {partialCancellation && (
        <Section style={{ ...styles.card, borderColor: '#f59e0b', background: '#fff7ed' }}>
          <Text style={{ ...styles.muted, margin: '0 0 6px', color: '#9a3412' }}>Cancelamento parcial</Text>
          <Text style={{ ...styles.text, margin: '0 0 8px' }}>
            Tivemos uma divergência de estoque e precisamos cancelar{' '}
            <strong>{partialCancellation.quantity}× {partialCancellation.itemName}</strong>{' '}
            do seu pedido. O restante segue normalmente.
          </Text>
          {typeof partialCancellation.refundCents === 'number' && (
            <Text style={{ ...styles.text, margin: '0 0 6px' }}>
              Valor a reembolsar: <strong>{fmtBRL(partialCancellation.refundCents)}</strong>
            </Text>
          )}
          {partialCancellation.refundMethod && (
            <Text style={{ ...styles.muted, margin: 0 }}>
              Forma do reembolso: {REFUND_METHOD_LABEL[partialCancellation.refundMethod] ?? partialCancellation.refundMethod}
            </Text>
          )}
          {partialCancellation.couponCode && (
            <Text style={{ ...styles.text, margin: '8px 0 0', fontFamily: 'monospace', fontWeight: 600 }}>
              Cupom: {partialCancellation.couponCode}
            </Text>
          )}
          {partialCancellation.adminNote && (
            <Section style={{ marginTop: 12, padding: '10px 12px', background: '#fff', borderRadius: 6, border: '1px solid #fed7aa' }}>
              <Text style={{ ...styles.muted, margin: '0 0 4px', color: '#9a3412' }}>Mensagem da nossa equipe</Text>
              <Text style={{ ...styles.text, margin: 0, whiteSpace: 'pre-wrap' }}>{partialCancellation.adminNote}</Text>
            </Section>
          )}
        </Section>
      )}

      {cancellation && (
        <Section style={{ ...styles.card, borderColor: '#ef4444', background: '#fef2f2' }}>
          <Text style={{ ...styles.muted, margin: '0 0 6px', color: '#991b1b' }}>Itens cancelados</Text>
          {(cancellation.items ?? []).map((it, i) => (
            <Text key={i} style={{ ...styles.text, margin: '0 0 4px' }}>
              • <strong>{it.quantity}× {it.name}</strong>
            </Text>
          ))}
          {typeof cancellation.refundCents === 'number' && cancellation.refundCents > 0 && (
            <Text style={{ ...styles.text, margin: '10px 0 6px' }}>
              Valor a reembolsar: <strong>{fmtBRL(cancellation.refundCents)}</strong>
            </Text>
          )}
          {cancellation.refundMethod && cancellation.refundMethod !== 'none' && (
            <Text style={{ ...styles.muted, margin: 0 }}>
              Forma do reembolso: {REFUND_METHOD_LABEL[cancellation.refundMethod] ?? cancellation.refundMethod}
            </Text>
          )}
          {cancellation.couponCode && (
            <Text style={{ ...styles.text, margin: '8px 0 0', fontFamily: 'monospace', fontWeight: 600 }}>
              Cupom: {cancellation.couponCode}
            </Text>
          )}
        </Section>
      )}




      <Text style={styles.muted}>
        Acompanhe os detalhes em{' '}
        <a href={`${SITE_URL}/orders/${orderId ?? ''}`} style={{ color: '#111', fontWeight: 600 }}>
          minha conta → pedidos
        </a>.
      </Text>
    </EmailLayout>
  )
}

export const template = {
  component: OrderStatusUpdatedEmail,
  subject: (data: Record<string, any>) => {
    const id = typeof data.orderId === 'string' ? `#${data.orderId.slice(0, 8).toUpperCase()}` : ''
    const label = (data.status && STATUS_LABEL[data.status]) || data.status || 'atualizado'
    return `Pedido ${id}: ${label}`.trim()
  },
  displayName: 'Status do pedido atualizado',
  previewData: {
    recipientName: 'Ash',
    orderId: '7f3e8c12-aaaa-bbbb-cccc-ddddeeeeffff',
    status: 'shipped',
    trackingCode: 'AA123456789BR',
  },
} satisfies TemplateEntry
