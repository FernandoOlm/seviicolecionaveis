import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const PROCESS_NAME = "bot_seviicolecionaveis";

export const Route = createFileRoute("/admin/conectar-bot")({
  head: () => ({ meta: [{ title: "Conectar Bot — Sevii Admin" }] }),
  component: ConectarBotPage,
});

type Instance = {
  id: string;
  process_name: string;
  status: string;
  qr_code_base64: string | null;
  bot_number: string | null;
  command: string | null;
  updated_at: string;
};

type Group = {
  id: string;
  group_jid: string;
  group_name: string | null;
  group_type: string;
  status: string;
  activated_at: string;
};

type Code = {
  id: string;
  code: string;
  group_name: string | null;
  group_type: string;
  is_used: boolean;
  used_by_jid: string | null;
  expires_at: string | null;
};

function ConectarBotPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState("principal");

  const load = useCallback(async () => {
    const [inst, grp, cds] = await Promise.all([
      (supabase as any)
        .from("bot_instances")
        .select("*")
        .eq("process_name", PROCESS_NAME)
        .maybeSingle(),
      (supabase as any).from("bot_groups").select("*").order("activated_at", { ascending: false }),
      (supabase as any)
        .from("activation_codes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setInstance(inst.data ?? null);
    setGroups(grp.data ?? []);
    setCodes(cds.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const channel = (supabase as any)
      .channel("bot-instances-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bot_instances" },
        () => load(),
      )
      .subscribe();
    const timer = setInterval(load, 15000);
    return () => {
      clearInterval(timer);
      (supabase as any).removeChannel(channel);
    };
  }, [isAdmin, load]);

  async function resetAuth() {
    if (!confirm("Reiniciar a conexão do bot e gerar um novo QR Code?")) return;
    setBusy(true);
    const { error } = await (supabase as any).from("bot_instances").upsert(
      {
        process_name: PROCESS_NAME,
        command: "RESET_AUTH",
        status: "STARTING",
        qr_code_base64: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "process_name" },
    );
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Comando enviado. Aguarde o novo QR Code.");
      load();
    }
  }

  async function generateCode() {
    setBusy(true);
    const code = String(Math.floor(1000000000 + Math.random() * 9000000000));
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await (supabase as any).from("activation_codes").insert({
      code,
      group_name: newGroupName || null,
      group_type: newGroupType,
      expires_at: expires,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Código gerado: ${code}`);
      setNewGroupName("");
      load();
    }
  }

  async function toggleGroup(g: Group) {
    const next = g.status === "active" ? "inactive" : "active";
    const { error } = await (supabase as any)
      .from("bot_groups")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", g.id);
    if (error) toast.error(error.message);
    else load();
  }

  if (authLoading) return null;
  if (!isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center text-sm">
        Acesso restrito. <Link to="/" className="ml-1 underline">Voltar</Link>
      </div>
    );
  }

  const status = instance?.status ?? "DISCONNECTED";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conectar Bot WhatsApp</h1>
        <p className="text-xs text-muted-foreground font-mono">{PROCESS_NAME}</p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-bold text-lg">Instância do bot</h2>
            <p className="text-xs text-muted-foreground">
              Status em tempo real da conexão com o WhatsApp.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
              status === "CONNECTED"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                : status === "AWAITING_SCAN"
                  ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
            }`}
          >
            {status === "CONNECTED"
              ? "🟢 Conectado"
              : status === "AWAITING_SCAN"
                ? "Aguardando leitura do QR"
                : status === "STARTING"
                  ? "Iniciando..."
                  : "Desconectado"}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !instance ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma instância registrada ainda. Inicie o bot na VPS — ele se registra
            automaticamente ao subir.
          </p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
                  Número do bot
                </dt>
                <dd className="font-mono font-semibold">{instance.bot_number ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
                  Atualizado em
                </dt>
                <dd className="font-mono">
                  {new Date(instance.updated_at).toLocaleString("pt-BR")}
                </dd>
              </div>
              {instance.command && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
                    Comando pendente
                  </dt>
                  <dd className="font-mono">{instance.command}</dd>
                </div>
              )}
            </dl>

            {status === "AWAITING_SCAN" && instance.qr_code_base64 && (
              <div className="rounded-md border border-border p-4 text-center">
                <p className="text-xs text-muted-foreground mb-3">
                  Abra o WhatsApp → Aparelhos conectados → Conectar aparelho e leia o código:
                </p>
                <img
                  src={instance.qr_code_base64}
                  alt="QR Code para conectar o bot ao WhatsApp"
                  className="mx-auto h-56 w-56 rounded-md bg-white p-2"
                />
              </div>
            )}

            {(status === "STARTING" || status === "DISCONNECTED") && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-100">
                Bot sem sessão ativa. Use o botão abaixo para gerar um novo QR Code.
              </div>
            )}

            <button
              onClick={resetAuth}
              disabled={busy}
              className="rounded-md bg-foreground text-background px-4 py-2 text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-40"
            >
              Reiniciar conexão / Gerar novo QR Code
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="font-bold text-lg">Ativação de grupos</h2>
          <p className="text-xs text-muted-foreground">
            Gere um código e digite <code>!ativar &lt;código&gt;</code> no grupo do WhatsApp onde o
            bot deve atuar.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 items-end">
          <label className="text-xs sm:col-span-1">
            <span className="block mb-1 text-muted-foreground">Nome do grupo (opcional)</span>
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
          </label>
          <label className="text-xs">
            <span className="block mb-1 text-muted-foreground">Tipo</span>
            <select
              value={newGroupType}
              onChange={(e) => setNewGroupType(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option value="principal">Principal</option>
              <option value="teste">Teste</option>
              <option value="leilao">Leilão</option>
            </select>
          </label>
          <button
            onClick={generateCode}
            disabled={busy}
            className="rounded-md bg-foreground text-background px-4 py-2 text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-40"
          >
            Gerar código
          </button>
        </div>

        {codes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left py-1">Código</th>
                  <th className="text-left">Grupo</th>
                  <th className="text-left">Tipo</th>
                  <th className="text-left">Situação</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-1.5 font-mono font-bold">{c.code}</td>
                    <td>{c.group_name ?? "—"}</td>
                    <td>{c.group_type}</td>
                    <td>
                      {c.is_used
                        ? "Usado"
                        : c.expires_at && new Date(c.expires_at) < new Date()
                          ? "Expirado"
                          : "Disponível"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-bold text-lg mb-3">Grupos ativados</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum grupo ativado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{g.group_name ?? "Sem nome"}</p>
                  <p className="text-[10px] font-mono text-muted-foreground break-all">
                    {g.group_jid} · {g.group_type}
                  </p>
                </div>
                <button
                  onClick={() => toggleGroup(g)}
                  className={`rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                    g.status === "active"
                      ? "border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      : "bg-foreground text-background"
                  }`}
                >
                  {g.status === "active" ? "Desativar" : "Ativar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
