import * as React from 'react'
import { Heading, Section, Text, Button } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, styles, SITE_URL } from './_shared'
import { STORE_WHATSAPP } from '../scheduling'

interface Props {
  recipientName?: string
  orderId?: string
  previous?: string
}

const btn = { background: '#111', color: '#fff', padding: '12px 22px', borderRadius: 6, fontWeight: 700, fontSize: 14, margin: '6px' }

const PickupReopenedEmail: React.FC<Props> = ({ recipientName, orderId, previous }) => {
  const code = orderId ? orderId.slice(0, 8).toUpperCase() : ''
  const href = orderId ? `${SITE_URL}/orders/${orderId}` : `${SITE_URL}/orders`
  const wa = `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(`Olá! Quero reagendar a retirada do pedido #${code}`)}`
  return (
    <EmailLayout preview="Escolha um novo horário para sua retirada">
      <Heading style={styles.h1}>{recipientName ? `Olá, ${recipientName}!` : 'Olá!'}</Heading>
      <Text style={styles.text}>
        Não conseguimos concluir sua retirada no horário agendado. Você pode escolher um novo horário pelo link abaixo.
      </Text>
      {(code || previous) && (
        <Section style={styles.card}>
          {code && <Text style={{ ...styles.text, margin: '0 0 6px' }}>Pedido #{code}</Text>}
          {previous && <Text style={{ ...styles.muted, margin: 0 }}>Horário anterior: {previous}</Text>}
        </Section>
      )}
      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={href} style={btn}>Escolher novo horário</Button>
        <Button href={wa} style={{ ...btn, background: '#25D366' }}>Falar no WhatsApp</Button>
      </Section>
    </EmailLayout>
  )
}

export const template = {
  component: PickupReopenedEmail,
  subject: 'Reagende sua retirada',
  displayName: 'Retirada reaberta (reagendamento)',
  previewData: { recipientName: 'Ana', orderId: '12345678-0000-0000-0000-000000000000', previous: 'sexta, 30/10/2026 às 15:00' },
} satisfies TemplateEntry
