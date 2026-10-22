import * as React from "react";
import { Button, Heading, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { EmailLayout, styles } from "./_shared";

interface Props {
  audience?: "client" | "store";
  subject?: string;
  action?: "defined" | "changed" | "cancelled";
  sourceLabel?: string;
  code?: string;
  service?: string;
  when?: string;
  location?: string;
  fee?: string;
  before?: string;
  after?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  items?: string[];
  relatedOrders?: string;
  adminUrl?: string;
  customerUrl?: string;
  calendarUrl?: string;
}

const WHATSAPP = "https://wa.me/5579981509552";

function FulfillmentUpdateEmail(p: Props) {
  const store = p.audience === "store";
  const heading = p.subject ?? "Atualização do seu pedido";
  const intro = store
    ? `${p.customerName ?? "Cliente"} — ${p.action === "cancelled" ? "agendamento cancelado" : p.action === "changed" ? "modalidade alterada" : "modalidade escolhida"}${p.sourceLabel ? ` (${p.sourceLabel})` : ""}.`
    : `${p.customerName ? `${p.customerName}, ` : ""}${p.action === "cancelled" ? "seu agendamento foi cancelado. Se quiser marcar outro, é só falar com a gente." : p.action === "changed" ? "a forma de retirada/envio do seu pedido foi atualizada." : "recebemos a sua escolha de retirada/envio."}`;
  return (
    <EmailLayout preview={`${heading} · ${p.code ?? ""}`}>
      <Heading style={styles.h1}>{heading}</Heading>
      <Text style={styles.text}>{intro}</Text>
      {p.action === "changed" && p.before && (
        <Section style={styles.card}>
          <Text style={styles.text}><strong>Antes:</strong> {p.before}<br /><strong>Agora:</strong> {p.after ?? p.service}</Text>
        </Section>
      )}
      {store && p.action !== "defined" && p.before && (
        <Text style={styles.muted}>O agendamento anterior foi substituído. Remova o evento antigo do calendário.</Text>
      )}
      <Section style={styles.card}>
        <Text style={styles.text}>
          <strong>Pedido:</strong> {p.code}<br />
          <strong>Modalidade:</strong> {p.service}<br />
          {p.when && <><strong>Data e horário:</strong> {p.when}<br /></>}
          {p.location && <><strong>Local:</strong> {p.location}<br /></>}
          {p.fee && <><strong>Taxa:</strong> {p.fee}<br /></>}
          {p.relatedOrders && <><strong>Pedidos incluídos:</strong> {p.relatedOrders}<br /></>}
        </Text>
      </Section>
      {store && (
        <Section style={styles.card}>
          <Text style={styles.text}>
            <strong>Cliente:</strong> {p.customerName ?? "—"}<br />
            {p.customerEmail && <><strong>E-mail:</strong> {p.customerEmail}<br /></>}
            {p.customerPhone && <><strong>Telefone:</strong> {p.customerPhone}<br /></>}
          </Text>
          {p.items && p.items.length > 0 && (
            <Text style={styles.muted}>{p.items.map((i, n) => <React.Fragment key={n}>{i}<br /></React.Fragment>)}</Text>
          )}
        </Section>
      )}
      {store ? (
        <>
          {p.calendarUrl && p.action !== "cancelled" && <Button href={p.calendarUrl} style={styles.badge}>Adicionar ao Google Calendar</Button>}
          {p.adminUrl && <Text style={styles.muted}><a href={p.adminUrl}>Abrir no painel admin</a></Text>}
        </>
      ) : (
        <>
          <Button href={WHATSAPP} style={styles.badge}>Falar com a loja no WhatsApp</Button>
          {p.customerUrl && <Text style={styles.muted}><a href={p.customerUrl}>Ver meu pedido</a></Text>}
        </>
      )}
    </EmailLayout>
  );
}

export const template = {
  component: FulfillmentUpdateEmail,
  subject: (d: Record<string, unknown>) => `${String(d.subject ?? "Atualização do pedido")} · ${String(d.code ?? "")}`,
  displayName: "Retirada/envio definido ou alterado",
  previewData: {
    audience: "client", subject: "Sua retirada foi alterada", action: "changed", code: "OS #42",
    service: "Retirada em eventos", when: "sábado, 24/10/2026 às 15:00", location: "Evento Pokémon Aracaju",
    before: "Retirada em mãos — Aruana, sexta 23/10 às 14:30", after: "Retirada em eventos — sábado 24/10 às 15:00",
    customerName: "Ana",
  },
} satisfies TemplateEntry;
