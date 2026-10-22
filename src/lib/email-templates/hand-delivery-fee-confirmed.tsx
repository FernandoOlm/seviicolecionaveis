import * as React from 'react'
import { Heading, Section, Text, Button } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, styles, SITE_URL } from './_shared'
import { STORE_WHATSAPP } from '../scheduling'

interface Props {
  recipientName?: string
  orderId?: string
  when?: string
  address?: string
}

const btn = { background: '#111', color: '#fff', padding: '12px 22px', borderRadius: 6, fontWeight: 700, fontSize: 14, margin: '6px' }

const HandDeliveryFeeConfirmedEmail: React.FC<Props> = ({ recipientName, orderId, when, address }) => {
  const code = orderId ? orderId.slice(0, 8).toUpperCase() : ''
  const href = orderId ? `${SITE_URL}/orders/${orderId}` : `${SITE_URL}/orders`
  const wa = `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(`Olá! Sobre a Entrega em mãos do pedido #${code}`)}`
  return (
    <EmailLayout preview="Recebemos o pagamento da sua entrega">
      <Heading style={styles.h1}>{recipientName ? `Olá, ${recipientName}!` : 'Olá!'}</Heading>
      <Text style={styles.text}>Recebemos o pagamento da sua entrega. Está tudo certo para a Entrega em mãos.</Text>
      <Section style={styles.card}>
        {code && <Text style={{ ...styles.text, margin: '0 0 6px' }}>Pedido #{code}</Text>}
        {when && <Text style={{ ...styles.muted, margin: '0 0 4px' }}>Data da entrega: {when}</Text>}
        {address && <Text style={{ ...styles.muted, margin: 0 }}>Endereço: {address}</Text>}
      </Section>
      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={href} style={btn}>Ver pedido</Button>
        <Button href={wa} style={{ ...btn, background: '#25D366' }}>Falar no WhatsApp</Button>
      </Section>
    </EmailLayout>
  )
}

export const template = {
  component: HandDeliveryFeeConfirmedEmail,
  subject: 'Recebemos o pagamento da sua entrega',
  displayName: 'Entrega em mãos — pagamento confirmado',
  previewData: { recipientName: 'Ana', orderId: '12345678-0000-0000-0000-000000000000', when: 'quinta, 29/10/2026 a partir das 19:00', address: 'Rua A, 10 · Aracaju/SE' },
} satisfies TemplateEntry
