import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PickupEvent } from "./events";

// Cliente público (somente leitura) para o calendário de eventos no checkout.
function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const mapEvent = (r: any): PickupEvent => ({
  id: r.id,
  name: r.name,
  description: r.description ?? null,
  start_date: r.start_date,
  end_date: r.end_date,
  start_time: String(r.start_time).slice(0, 5),
  end_time: String(r.end_time).slice(0, 5),
  per_day_times: (r.per_day_times as PickupEvent["per_day_times"]) ?? null,
  active: r.active,
});

/** Eventos ativos (inclui encerrados para agendamento — o cliente mostra como fechados). */
export const listActiveEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient()
    .from("events")
    .select("*")
    .eq("active", true)
    .gte("end_date", new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10))
    .order("start_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapEvent);
});

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

/** Admin: todos os eventos (futuros e passados, ativos e inativos). */
export const listAllEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("events")
      .select("*")
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapEvent);
  });

const EventInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullish(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  per_day_times: z.record(z.string(), z.object({ start: z.string(), end: z.string() })).nullish(),
  active: z.boolean().default(true),
});

function validateEventInput(input: z.infer<typeof EventInput>) {
  if (input.end_date < input.start_date) throw new Error("A data final não pode ser anterior à data inicial.");
  if (input.end_time <= input.start_time) throw new Error("O horário de término deve ser depois do início.");
  for (const [day, t] of Object.entries(input.per_day_times ?? {})) {
    if (day < input.start_date || day > input.end_date) throw new Error(`Horário personalizado fora do período: ${day}`);
    if (t.end <= t.start) throw new Error(`Horário inválido em ${day}: término deve ser depois do início.`);
  }
}

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EventInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    validateEventInput(data);
    const { data: row, error } = await context.supabase
      .from("events")
      .insert({ ...data, description: data.description || null, per_day_times: data.per_day_times ?? null })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapEvent(row);
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), data: EventInput }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    validateEventInput(data.data);
    const { data: row, error } = await context.supabase
      .from("events")
      .update({
        ...data.data,
        description: data.data.description || null,
        per_day_times: data.data.per_day_times ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapEvent(row);
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    // Desvincula pedidos antes de excluir (mantém o histórico do pedido).
    await context.supabase.from("orders").update({ event_id: null }).eq("event_id", data.id);
    const { error } = await context.supabase.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Pedidos vinculados ao evento (não entregues/cancelados), para avisos e listagem. */
export const listEventOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid(), includeFinished: z.boolean().default(true) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    let q = context.supabase
      .from("orders")
      .select("id, recipient_name, email, status, scheduled_at, schedule_kind, reschedule_required, total_cents, created_at, event_added_manually_at, order_items(quantity)")
      .eq("event_id", data.eventId)
      .order("scheduled_at", { ascending: true });
    if (!data.includeFinished) q = q.not("status", "in", '("delivered","cancelled")');
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((o: any) => ({
      id: o.id as string,
      code: (o.id as string).slice(0, 8).toUpperCase(),
      recipientName: o.recipient_name as string | null,
      email: o.email as string | null,
      status: o.status as string,
      scheduledAt: o.scheduled_at as string | null,
      rescheduleRequired: !!o.reschedule_required,
      totalCents: o.total_cents as number,
      manual: !!o.event_added_manually_at,
      itemCount: ((o.order_items ?? []) as Array<{ quantity: number }>).reduce((a, i) => a + (i.quantity ?? 0), 0),
    }));
  });

/** Contagem de pedidos afetados (para avisos antes de excluir/desativar/alterar). */
export const countEventOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { count, error } = await context.supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("event_id", data.eventId)
      .not("status", "in", '("delivered","cancelled")');
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

/** Marca pedidos do evento cujo horário escolhido caiu fora do novo intervalo como "Reagendamento necessário". */
export const flagOutOfRangeEventOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: ev } = await context.supabase.from("events").select("*").eq("id", data.eventId).maybeSingle();
    if (!ev) return { flagged: 0 };
    const event = mapEvent(ev);
    const { data: rows } = await context.supabase
      .from("orders")
      .select("id, scheduled_at, reschedule_required, schedule_history")
      .eq("event_id", data.eventId)
      .eq("schedule_kind", "event")
      .not("status", "in", '("delivered","cancelled")')
      .not("scheduled_at", "is", null);
    const { validateEventSchedule, ymdOfIso } = await import("./events");
    const { localParts } = await import("./scheduling");
    let flagged = 0;
    for (const o of rows ?? []) {
      if (o.reschedule_required) continue;
      const ymd = ymdOfIso(o.scheduled_at);
      const slot = localParts(o.scheduled_at).time;
      if (validateEventSchedule(event, ymd, slot, new Date(0)) === null) continue; // ainda dentro do intervalo
      const history = Array.isArray(o.schedule_history) ? o.schedule_history : [];
      history.push({
        scheduled_at: o.scheduled_at,
        kind: "event",
        outcome: "Horário fora do novo intervalo do evento",
        recorded_at: new Date().toISOString(),
      });
      await context.supabase
        .from("orders")
        .update({ reschedule_required: true, schedule_reopened_at: new Date().toISOString(), schedule_history: history })
        .eq("id", o.id)
        .eq("reschedule_required", false);
      flagged++;
    }
    return { flagged };
  });
