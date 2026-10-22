import * as React from "react";
import { Button, Heading, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { EmailLayout, styles, SITE_URL } from "./_shared";

interface Props {
  recipientName?: string; orderId?: string; service?: string; when?: string;
  address?: string; delivery?: boolean; deliveryFeePending?: boolean;
  calendarUrl?: string; storeCopy?: boolean;
  adminEdit?: boolean; replacedPrevious?: string; otherOrders?: string;
}
function ScheduleConfirmedEmail(props: Props) {
  const shortId = props.orderId ? `#${props.orderId.slice(0, 8).toUpperCase()}` : "";
  return <EmailLayout preview={`${props.service ?? "Agendamento"} · ${shortId} · ${props.when ?? ""}`}>
    <Heading style={styles.h1}>Agendamento confirmado</Heading>
    <Text style={styles.text}>{props.storeCopy
      ? (props.adminEdit ? `Agendamento de ${props.recipientName ?? "cliente"} alterado pelo admin.` : `Novo agendamento de ${props.recipientName ?? "cliente"}.`)
      : (props.adminEdit ? `${props.recipientName ?? "Olá"}, a forma de envio/retirada do seu pedido foi atualizada conforme combinamos.` : `${props.recipientName ?? "Olá"}, o pagamento do seu pedido foi confirmado e seu agendamento está registrado.`)}</Text>
    {props.storeCopy && props.replacedPrevious && <Text style={styles.muted}><strong>Substitui o agendamento anterior:</strong> {props.replacedPrevious}. Remova o evento antigo do calendário.</Text>}
    {props.otherOrders && <Text style={styles.muted}>Também vale para os pedidos {props.otherOrders}.</Text>}
    <Section style={styles.card}>
      <Text style={styles.text}><strong>Pedido:</strong> {shortId}<br />
        <strong>Serviço:</strong> {props.service}<br />
        <strong>Data e horário:</strong> {props.when}<br />
        {props.address && <><strong>Endereço:</strong> {props.address}<br /></>}
      </Text>
    </Section>
    {props.delivery && <Text style={styles.muted}>A entrega começa a partir das 19h. O horário de chegada varia conforme a rota do dia.</Text>}
    {props.deliveryFeePending && <Text style={styles.muted}>A taxa de entrega é paga separadamente e ainda aguarda confirmação da loja.</Text>}
    {props.storeCopy && props.calendarUrl
      ? <Button href={props.calendarUrl} style={styles.badge}>Adicionar ao Google Calendar</Button>
      : <Button href={`${SITE_URL}/orders/${props.orderId ?? ""}`} style={styles.badge}>Ver meu pedido</Button>}
  </EmailLayout>;
}
export const template = {
  component: ScheduleConfirmedEmail,
  subject: (data: Record<string, unknown>) => `${data.adminEdit ? "Agendamento atualizado" : "Agendamento confirmado"} · ${data.service ?? "Pedido"} · #${String(data.orderId ?? "").slice(0, 8).toUpperCase()}`,
  displayName: "Agendamento confirmado",
  previewData: { recipientName: "Cliente", orderId: "12345678-abcd", service: "Retirada em mãos", when: "sexta, 30/10/2026 às 14:30", address: "Aruana" },
} satisfies TemplateEntry;