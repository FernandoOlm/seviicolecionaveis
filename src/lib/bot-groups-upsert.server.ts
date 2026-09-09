// Handler compartilhado de sincronização de grupos do bot.
// Aceita a lista de grupos que o bot enxerga no WhatsApp e mantém
// public.bot_groups atualizado (nomes, novos grupos como "pending").
import { verifyBotAuth, BOT_PROCESS_NAME } from "@/lib/bot-auth.server";

type IncomingGroup = {
  jid?: unknown;
  group_jid?: unknown;
  id?: unknown;
  name?: unknown;
  group_name?: unknown;
  subject?: unknown;
  group_type?: unknown;
  type?: unknown;
};

const str = (...vals: unknown[]) => {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};

export async function handleBotGroupsUpsert(request: Request): Promise<Response> {
  const denied = verifyBotAuth(request);
  if (denied) return denied;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body?.process_name && body.process_name !== BOT_PROCESS_NAME) {
    return Response.json(
      { error: `process_name inválido. Esperado: ${BOT_PROCESS_NAME}` },
      { status: 400 },
    );
  }

  const raw: IncomingGroup[] = Array.isArray(body)
    ? body
    : Array.isArray(body?.groups)
      ? body.groups
      : Array.isArray(body?.chats)
        ? body.chats
        : [];

  if (!Array.isArray(raw)) {
    return Response.json({ error: "groups deve ser um array" }, { status: 400 });
  }

  const groups = raw
    .map((g) => ({
      group_jid: str(g?.group_jid, g?.jid, g?.id),
      group_name: str(g?.group_name, g?.name, g?.subject),
      group_type: str(g?.group_type, g?.type) ?? "secundario",
    }))
    .filter((g) => g.group_jid && g.group_jid.endsWith("@g.us")) as {
    group_jid: string;
    group_name: string | null;
    group_type: string;
  }[];

  if (!groups.length) {
    return Response.json({ received: raw.length, upserted: 0, created: 0, updated: 0, groups: [] });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const jids = groups.map((g) => g.group_jid);

  const { data: existing, error: selErr } = await (supabaseAdmin as any)
    .from("bot_groups")
    .select("group_jid, status")
    .in("group_jid", jids);
  if (selErr) return Response.json({ error: selErr.message }, { status: 500 });

  const known = new Map<string, string>(
    ((existing ?? []) as any[]).map((r) => [r.group_jid as string, r.status as string]),
  );

  const rows = groups.map((g) => ({
    group_jid: g.group_jid,
    group_name: g.group_name,
    group_type: g.group_type,
    // Nunca reativa/desativa automaticamente: a ativação é feita via !ativar <codigo>.
    status: known.get(g.group_jid) ?? "pending",
    updated_at: new Date().toISOString(),
  }));

  const { error: upErr } = await (supabaseAdmin as any)
    .from("bot_groups")
    .upsert(rows, { onConflict: "group_jid" });
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

  const created = rows.filter((r) => !known.has(r.group_jid)).length;

  return Response.json({
    success: true,
    process_name: BOT_PROCESS_NAME,
    received: raw.length,
    upserted: rows.length,
    created,
    updated: rows.length - created,
    active_jids: rows.filter((r) => r.status === "active").map((r) => r.group_jid),
  });
}
