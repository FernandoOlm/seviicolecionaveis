import React from "react";
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  recipientName?: string;
  orderId?: string;
  eventName?: string;
  eventWhen?: string;
  kind?: "changed" | "deactivated" | "cancelled";
}

const MESSAGES = {
  changed: "As informações do evento em que você agendou a retirada do seu pedido foram alteradas.",
  deactivated: "O evento em que você agendou a retirada do seu pedido foi desativado.",
  cancelled: "O evento em que você agendou a retirada do seu pedido foi cancelado.",
};

const Email = ({ recipientName, orderId, eventName, eventWhen, kind = "changed" }: Props) => {
  const shortId = orderId ? `#${orderId.slice(0, 8).toUpperCase()}` : "";
  const orderUrl = orderId ? `https://seviicolecionaveis.com.br/orders/${orderId}` : "https://seviicolecionaveis.com.br/orders";
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{`Atualização sobre a retirada do seu pedido ${shortId} no evento ${eventName ?? ""}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Sevii Colecionáveis</Heading>
          <Text>{recipientName ? `Olá, ${recipientName}!` : "Olá!"}</Text>
          <Text>{MESSAGES[kind] ?? MESSAGES.changed}</Text>
          <Text>
            <strong>Evento:</strong> {eventName ?? "—"}
            <br />
            <strong>Data:</strong> {eventWhen ?? "—"}
            <br />
            <strong>Pedido:</strong> {shortId}
          </Text>
          <Text>
            Acesse a página do seu pedido para ver os detalhes e, se necessário, escolher uma nova forma de retirada ou
            envio.
          </Text>
          <Button style={button} href={orderUrl}>
            Ver meu pedido
          </Button>
          <Text style={muted}>Qualquer dúvida, fale com a gente pelo WhatsApp.</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: "Atualização sobre a retirada do seu pedido em evento",
  displayName: "Evento alterado/cancelado",
  previewData: {
    recipientName: "Maria",
    orderId: "00000000-0000-0000-0000-000000000000",
    eventName: "Encontro Pokémon TCG",
    eventWhen: "20/11/2026, 14h às 18h",
    kind: "changed",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "20px 25px" };
const h1 = { fontSize: "20px" };
const button = {
  backgroundColor: "#1d4ed8",
  color: "#ffffff",
  padding: "10px 18px",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: "bold" as const,
};
const muted = { color: "#6b7280", fontSize: "12px" };
