import * as React from 'react'
import { Heading, Section, Text, Button } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, styles, SITE_URL } from './_shared'

interface StackExpiredProps {
  recipientName?: string
  stackId?: string
  itemCount?: number
}

const StackExpiredEmail: React.FC<StackExpiredProps> = ({ recipientName, stackId, itemCount }) => {
  const href = stackId
    ? `${SITE_URL}/pilha/solicitar?stack=${encodeURIComponent(stackId)}`
    : `${SITE_URL}/pilha`
  return (
    <EmailLayout preview="O prazo de armazenamento da sua Pilha de Cartas terminou">
      <Heading style={styles.h1}>{recipientName ? `Olá, ${recipientName}!` : 'Olá!'}</Heading>
      <Text style={styles.text}>
        O prazo de <strong>30 dias</strong> de armazenamento gratuito da sua <strong>Pilha de Cartas</strong> terminou.
        Agora é só escolher como prefere receber suas cartas.
      </Text>

      <Section style={styles.card}>
        {typeof itemCount === 'number' && itemCount > 0 && (
          <Text style={{ ...styles.text, margin: '0 0 8px' }}>
            {itemCount} carta{itemCount === 1 ? '' : 's'} aguardando envio ou retirada
          </Text>
        )}
        <Text style={{ ...styles.muted, margin: 0 }}>
          Opções: Correios, Entrega por aplicativo, Retirada presencial (Aruana ou Aeroporto) ou Retirada em eventos.
        </Text>
      </Section>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button
          href={href}
          style={{
            background: '#111',
            color: '#fff',
            padding: '12px 22px',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Escolher retirada ou envio
        </Button>
      </Section>
    </EmailLayout>
  )
}

export const template = {
  component: StackExpiredEmail,
  subject: 'Sua Pilha de Cartas: escolha a retirada ou envio',
  displayName: 'Pilha — fim do prazo (30 dias)',
  previewData: { recipientName: 'Ana', stackId: '00000000-0000-0000-0000-000000000000', itemCount: 5 },
} satisfies TemplateEntry
