// Mercado Pago server helper — Pix + Cartão (Card Brick).
// Docs: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post
import { validCpf as validateCpf } from "./customer-payment";

const MP_API = "https://api.mercadopago.com";
const MP_TIMEOUT_MS = 20000;

async function fetchMpWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("Mercado Pago demorou demais para responder. Tente novamente em alguns segundos.");
    }
    throw new Error(`Falha de conexão com Mercado Pago: ${e?.message ?? "erro de rede"}`);
  } finally {
    clearTimeout(timer);
  }
}

function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado");
  return token;
}

export function getMercadoPagoPublicKeyServer(): string {
  const key = process.env.MERCADOPAGO_PUBLIC_KEY;
  if (!key) throw new Error("MERCADOPAGO_PUBLIC_KEY não configurado");
  return key;
}

export interface CreateCardInput {
  amountCents: number;
  description: string;
  token: string; // card token from Brick
  paymentMethodId: string; // visa, master, etc
  issuerId?: string | null;
  installments: number;
  payerEmail: string;
  payerFirstName?: string;
  payerLastName?: string;
  payerCpf?: string | null;
  externalReference: string;
  notificationUrl: string;
  customerId?: string | null; // MP customer id — quando presente, MP vincula o cartão ao cliente
}

export interface CardPaymentResult {
  id: number;
  status: string; // approved, in_process, rejected, ...
  status_detail?: string;
  card_id?: string | null;
  card_last_four?: string | null;
  card_brand?: string | null;
  card_exp_month?: number | null;
  card_exp_year?: number | null;
  card_cardholder_name?: string | null;
}

export async function createCardPaymentMP(input: CreateCardInput): Promise<CardPaymentResult> {
  const token = getAccessToken();
  const cleanCpf = validateCpf(input.payerCpf) ?? undefined;
  if (input.payerCpf && !cleanCpf) {
    throw new Error("CPF inválido. Verifique o número informado e tente novamente.");
  }

  const payer: Record<string, unknown> = {
    email: input.payerEmail,
    first_name: input.payerFirstName?.slice(0, 50) ?? "Cliente",
    last_name: input.payerLastName?.slice(0, 50) ?? "Sevii",
    ...(cleanCpf && cleanCpf.length === 11
      ? { identification: { type: "CPF", number: cleanCpf } }
      : {}),
  };
  // Quando passamos o customer id, MP vincula o cartão ao customer automaticamente
  // (o cartão fica disponível em /v1/customers/{id}/cards após a aprovação).
  if (input.customerId) {
    payer.type = "customer";
    payer.id = input.customerId;
  }

  const body: Record<string, unknown> = {
    transaction_amount: Number((input.amountCents / 100).toFixed(2)),
    token: input.token,
    description: input.description.slice(0, 250),
    installments: input.installments,
    payment_method_id: input.paymentMethodId,
    ...(input.issuerId ? { issuer_id: input.issuerId } : {}),
    external_reference: input.externalReference,
    notification_url: input.notificationUrl,
    payer,
  };

  const idempotencyKey = `${input.externalReference}-card-${Date.now()}`;

  const res = await fetchMpWithTimeout(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("MP create card payment failed", res.status);
    throw new Error("O Mercado Pago não conseguiu processar o cartão. Confira os dados ou tente novamente.");
  }

  const card = json.card ?? {};
  return {
    id: json.id,
    status: json.status,
    status_detail: json.status_detail,
    card_id: card.id ?? null,
    card_last_four: card.last_four_digits ?? null,
    card_brand: json.payment_method_id ?? null,
    card_exp_month: card.expiration_month ?? null,
    card_exp_year: card.expiration_year ?? null,
    card_cardholder_name: card.cardholder?.name ?? null,
  };
}

// ============================================================
// Customers + saved cards
// ============================================================

export interface MpCustomerCard {
  id: string;
  last_four_digits: string;
  payment_method?: { id?: string; name?: string };
  expiration_month?: number;
  expiration_year?: number;
  cardholder?: { name?: string };
}

export async function findMpCustomerByEmail(email: string): Promise<{ id: string } | null> {
  const token = getAccessToken();
  const res = await fetchMpWithTimeout(
    `${MP_API}/v1/customers/search?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const json: any = await res.json().catch(() => ({}));
  const first = json?.results?.[0];
  return first?.id ? { id: first.id } : null;
}

export async function createMpCustomer(email: string, firstName?: string, lastName?: string): Promise<{ id: string }> {
  const token = getAccessToken();
  const res = await fetchMpWithTimeout(`${MP_API}/v1/customers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `customer-${email}-${Date.now()}`,
    },
    body: JSON.stringify({
      email,
      first_name: firstName?.slice(0, 50) ?? "Cliente",
      last_name: lastName?.slice(0, 50) ?? "Sevii",
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // pode ser conflito (já existe). tenta buscar.
    const existing = await findMpCustomerByEmail(email);
    if (existing) return existing;
    throw new Error(`Mercado Pago (customer): ${json?.message ?? res.status}`);
  }
  return { id: json.id };
}

export async function getOrCreateMpCustomer(email: string, firstName?: string, lastName?: string): Promise<string> {
  const existing = await findMpCustomerByEmail(email);
  if (existing) return existing.id;
  const created = await createMpCustomer(email, firstName, lastName);
  return created.id;
}

export async function listMpCustomerCards(customerId: string): Promise<MpCustomerCard[]> {
  const token = getAccessToken();
  const res = await fetchMpWithTimeout(`${MP_API}/v1/customers/${customerId}/cards`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const json: any = await res.json().catch(() => []);
  return Array.isArray(json) ? json : [];
}

export async function deleteMpCustomerCard(customerId: string, cardId: string): Promise<void> {
  const token = getAccessToken();
  await fetchMpWithTimeout(`${MP_API}/v1/customers/${customerId}/cards/${cardId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface CreatePixInput {
  amountCents: number;
  description: string;
  payerEmail: string;
  payerFirstName?: string;
  payerLastName?: string;
  payerCpf?: string | null;
  externalReference: string; // order id
  notificationUrl: string;
  expiresInMinutes?: number; // default 30
}

export interface PixPayment {
  id: number;
  status: string; // pending, approved, rejected, cancelled, in_process
  status_detail?: string;
  qr_code: string;
  qr_code_base64: string;
  date_of_expiration: string;
  ticket_url?: string;
}

export async function createPixPayment(input: CreatePixInput): Promise<PixPayment> {
  const token = getAccessToken();
  const expiresMin = input.expiresInMinutes ?? 30;
  const expirationDate = new Date(Date.now() + expiresMin * 60 * 1000).toISOString();
  const cleanCpf = validateCpf(input.payerCpf);
  if (!cleanCpf) {
    throw new Error(
      input.payerCpf
        ? "CPF inválido. Verifique o número informado no checkout — o Mercado Pago exige um CPF válido para gerar o Pix."
        : "CPF é obrigatório para pagamento via Pix. Preencha o campo CPF no checkout.",
    );
  }

  const body: Record<string, unknown> = {
    transaction_amount: Number((input.amountCents / 100).toFixed(2)),
    description: input.description.slice(0, 250),
    payment_method_id: "pix",
    external_reference: input.externalReference,
    notification_url: input.notificationUrl,
    date_of_expiration: expirationDate,
    payer: {
      email: input.payerEmail,
      first_name: input.payerFirstName?.slice(0, 50) ?? "Cliente",
      last_name: input.payerLastName?.slice(0, 50) ?? "Sevii",
      identification: { type: "CPF", number: cleanCpf },
    },
  };

  const idempotencyKey = `${input.externalReference}-${Date.now()}`;

  const res = await fetchMpWithTimeout(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("MP create payment failed", res.status);
    throw new Error("O Mercado Pago não conseguiu gerar o Pix. Confira seu cadastro ou tente novamente.");
  }

  const json: any = await res.json();
  const tx = json.point_of_interaction?.transaction_data;
  if (!tx?.qr_code || !tx?.qr_code_base64) {
    throw new Error("Resposta do Mercado Pago sem QR Code Pix");
  }

  return {
    id: json.id,
    status: json.status,
    status_detail: json.status_detail,
    qr_code: tx.qr_code,
    qr_code_base64: tx.qr_code_base64,
    date_of_expiration: json.date_of_expiration ?? expirationDate,
    ticket_url: tx.ticket_url,
  };
}

export async function getPixPayment(paymentId: string | number): Promise<{ status: string; external_reference?: string }> {
  const token = getAccessToken();
  const res = await fetchMpWithTimeout(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP get payment ${res.status}: ${text.slice(0, 200)}`);
  }
  const json: any = await res.json();
  return { status: json.status, external_reference: json.external_reference };
}

export async function findPaymentByExternalReference(
  externalReference: string,
): Promise<{ id: number; status: string; status_detail?: string } | null> {
  const token = getAccessToken();
  const url = `${MP_API}/v1/payments/search?sort=date_created&criteria=desc&external_reference=${encodeURIComponent(externalReference)}`;
  const res = await fetchMpWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP search ${res.status}: ${text.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const results: any[] = json?.results ?? [];
  if (results.length === 0) return null;
  // Prioriza pagamento aprovado, senão o mais recente
  const approved = results.find((r) => r.status === "approved");
  const chosen = approved ?? results[0];
  return { id: chosen.id, status: chosen.status, status_detail: chosen.status_detail };
}




export interface RefundResult {
  id: number;
  amount: number;
  status: string;
}

/**
 * Refunds (partial or total) a Mercado Pago payment.
 * Docs: https://www.mercadopago.com.br/developers/pt/reference/chargebacks/_payments_id_refunds/post
 * Passa amount em reais (com 2 casas). Omitir = reembolso total.
 */
export async function refundMercadoPagoPayment(
  paymentId: string | number,
  amountCents: number,
): Promise<RefundResult> {
  const token = getAccessToken();
  const body =
    amountCents > 0
      ? { amount: Number((amountCents / 100).toFixed(2)) }
      : {};
  const idempotencyKey = `refund-${paymentId}-${amountCents}-${Date.now()}`;
  const res = await fetchMpWithTimeout(`${MP_API}/v1/payments/${paymentId}/refunds`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("MP refund failed", res.status, json);
    const msg = json?.message || json?.error || `erro ${res.status}`;
    throw new Error(`Mercado Pago (reembolso): ${String(msg).slice(0, 300)}`);
  }
  return { id: json.id, amount: json.amount, status: json.status };
}
