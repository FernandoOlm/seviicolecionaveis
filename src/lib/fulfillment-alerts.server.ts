// Ponto central: "modalidade de retirada/envio definida, alterada ou cancelada".
// Todos os fluxos (checkout pago, Pilha de Cartas, admin, reagendamento, reabertura automática)
// chamam notifyFulfillmentChange — cria o alerta no admin e envia os e-mails de cliente e loja.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalEmailSafe } from "@/lib/email/send.server";
import { SCHEDULE_EMAIL_SETTING } from "@/lib/schedule-confirmation";
import {
  EMAIL_RETRY_DELAYS_MS, MODALITY_LABELS, clientEmailSubject, fulfillmentDedupeKey, fulfillmentTitle,
  type FulfillmentAction, type Modality,
} from "@/lib/fulfillment-alerts";

const FALLBACK_STORE_EMAIL = "seviicolecionaveis@gmail.com";
const SITE = "https://seviicolecionaveis.com.br";

export interface FulfillmentChange {
  targetType: "order" | "service_order";
  targetId: string;
  code: string; // "#ABCD1234" ou "OS #42"
  action: FulfillmentAction;
  source: "customer" | "admin" | "auto";
  modality: Modality;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  scheduledAt?: string | null;
  when?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  location?: string | null;
  fee?: string | null;
  before?: string | null;
  items?: string[];
  relatedOrders?: string[];
  calendarUrl?: string | null;
  notifyClient?: boolean; // padrão: true
  notifyStore?: boolean; // padrão: true
  dedupeExtra?: string | null;
}

const SOURCE_LABEL = { customer: "pelo cliente", admin: "pelo admin", auto: "automático" } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getStoreEmail(): Promise<string> {
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", SCHEDULE_EMAIL_SETTING).maybeSingle();
    const v: any = data?.value;
    const email = v && typeof v === "object" && typeof v.email === "string" ? v.email.trim() : "";
    return email || FALLBACK_STORE_EMAIL;
  } catch {
    return FALLBACK_STORE_EMAIL;
  }
}

async function sendWithRetry(params: Parameters<typeof sendTransactionalEmailSafe>[0]) {
  let last: any = null;
  for (const delay of EMAIL_RETRY_DELAYS_MS) {
    if (delay) await sleep(delay);
    last = await sendTransactionalEmailSafe(params);
    if (last?.success) return { ok: true as const };
    // Bloqueio do destinatário não é falha temporária: não insistir.
    if (last?.reason) return { ok: true as const, skipped: last.reason as string };
  }
  return { ok: false as const, error: String(last?.error ?? "send_failed") };
}

export async function notifyFulfillmentChange(c: FulfillmentChange): Promise<{ duplicate: boolean }> {
  const db = supabaseAdmin as any;
  const dedupeKey = fulfillmentDedupeKey({
    targetType: c.targetType, targetId: c.targetId, action: c.action, modality: c.modality,
    scheduledAt: c.scheduledAt, eventId: c.eventId, extra: c.dedupeExtra,
  });
  const service = MODALITY_LABELS[c.modality];
  const after = [service, c.eventName && c.modality === "event" ? c.eventName : c.location, c.when].filter(Boolean).join(" — ");

  // 1) Alerta no admin (persistido). Falha aqui não impede os e-mails.
  let notificationId: string | null = null;
  try {
    const { data, error } = await db.from("admin_notifications").upsert({
      kind: "fulfillment", action: c.action, source: c.source,
      title: fulfillmentTitle(c.action, c.modality),
      target_type: c.targetType, target_id: c.targetId, target_code: c.code,
      customer_name: c.customerName ?? null, customer_email: c.customerEmail ?? null,
      modality: c.modality, scheduled_at: c.scheduledAt ?? null, event_id: c.eventId ?? null, event_name: c.eventName ?? null,
      details: { when: c.when ?? null, location: c.location ?? null, before: c.before ?? null, related_orders: c.relatedOrders ?? [] },
      dedupe_key: dedupeKey,
    }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
    if (error) console.error("[fulfillment-alert] notification", error.message);
    else if (!data || data.length === 0) return { duplicate: true };
    else notificationId = data[0].id;
  } catch (e) {
    console.error("[fulfillment-alert] notification", e);
  }

  // 2) E-mails de cliente e loja, independentes entre si.
  const base = {
    action: c.action, code: c.code, service, when: c.when ?? undefined, location: (c.modality === "event" ? c.eventName ?? c.location : c.location) ?? undefined,
    fee: c.fee ?? undefined, before: c.before ?? undefined, after, customerName: c.customerName ?? undefined,
    relatedOrders: c.relatedOrders?.length ? c.relatedOrders.join(", ") : undefined,
  };
  const customerUrl = c.targetType === "order" ? `${SITE}/orders/${c.targetId}` : `${SITE}/pilha`;
  const adminUrl = c.targetType === "order" ? `${SITE}/admin/orders/${c.targetId}` : `${SITE}/admin/pilha`;
  const jobs: Array<Promise<[string, Awaited<ReturnType<typeof sendWithRetry>>]>> = [];
  if (c.notifyClient !== false && c.customerEmail) {
    jobs.push(sendWithRetry({
      templateName: "fulfillment-update", recipientEmail: c.customerEmail, idempotencyKey: `fulfillment-client-${dedupeKey}`,
      templateData: { ...base, audience: "client", subject: clientEmailSubject(c.action, c.modality), customerUrl },
    }).then((r) => ["client", r]));
  }
  if (c.notifyStore !== false) {
    jobs.push(getStoreEmail().then((to) => sendWithRetry({
      templateName: "fulfillment-update", recipientEmail: to, idempotencyKey: `fulfillment-store-${dedupeKey}`,
      templateData: {
        ...base, audience: "store", subject: `${fulfillmentTitle(c.action, c.modality)} · ${c.customerName ?? "Cliente"}`,
        sourceLabel: SOURCE_LABEL[c.source], customerEmail: c.customerEmail ?? undefined, customerPhone: c.customerPhone ?? undefined,
        items: c.items, adminUrl, calendarUrl: c.calendarUrl ?? undefined,
      },
    })).then((r) => ["store", r]));
  }
  const results = await Promise.allSettled(jobs);
  const status: Record<string, string> = {};
  const failed: string[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") { failed.push("desconhecido"); continue; }
    const [who, res] = r.value;
    status[who] = res.ok ? (res as any).skipped ? `skipped:${(res as any).skipped}` : "sent" : `failed:${(res as any).error}`;
    if (!res.ok) failed.push(who === "client" ? "cliente" : "loja");
  }
  if (notificationId) await db.from("admin_notifications").update({ email_status: status }).eq("id", notificationId).then(() => {}, () => {});

  // 3) Falha persistente: alerta separado no admin.
  if (failed.length) {
    await db.from("admin_notifications").upsert({
      kind: "notify_failed", action: c.action, source: c.source,
      title: `Falha ao notificar sobre o pedido ${c.code}`,
      target_type: c.targetType, target_id: c.targetId, target_code: c.code,
      customer_name: c.customerName ?? null, customer_email: c.customerEmail ?? null,
      modality: c.modality, scheduled_at: c.scheduledAt ?? null, event_id: c.eventId ?? null, event_name: c.eventName ?? null,
      details: { failed, status }, dedupe_key: `fail|${dedupeKey}`,
    }, { onConflict: "dedupe_key", ignoreDuplicates: true }).then(() => {}, () => {});
  }
  return { duplicate: false };
}
