import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getEmailLogs } from "@/utils/emailLogs.functions";
import ManualEmailComposer from "@/components/admin/ManualEmailComposer";
import { ScheduleEmailSettings } from "@/components/admin/ScheduleEmailSettings";

export const Route = createFileRoute("/admin/emails")({
  head: () => ({ meta: [
    { title: "E-mails e agendamentos · Sevii Admin" },
    { name: "description", content: "Gerencie os e-mails e as confirmações de agendamento da Sevii Colecionáveis." },
    { property: "og:title", content: "E-mails e agendamentos · Sevii Admin" },
    { property: "og:description", content: "Configurações e acompanhamento dos e-mails da loja." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: EmailsAdminPage,
});

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
  dlq: "bg-red-100 text-red-800",
  suppressed: "bg-gray-200 text-gray-800",
  bounced: "bg-orange-100 text-orange-800",
  complained: "bg-orange-100 text-orange-800",
};

const RANGES = [
  { label: "24h", hours: 24 },
  { label: "7 dias", hours: 168 },
  { label: "30 dias", hours: 720 },
];

type Row = {
  message_id: string;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
  subject: string | null;
  body_html: string | null;
  from_email: string | null;
  batch_id: string | null;
};

type Group = {
  key: string;
  template_name: string;
  batch_id: string | null;
  created_at: string;
  recipients_count: number;
  status_counts: Record<string, number>;
  items: Row[];
};

function StatusBadge({ s, n }: { s: string; n?: number }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
        STATUS_STYLES[s] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {n != null ? `${n} ${s}` : s}
    </span>
  );
}

function PreviewPanel({ row }: { row: Row }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Assunto</p>
          <p className="font-semibold break-words">{row.subject ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">De</p>
          <p className="font-mono break-all">{row.from_email ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Enviado em</p>
          <p>{new Date(row.created_at).toLocaleString("pt-BR")}</p>
        </div>
      </div>
      {row.body_html ? (
        <iframe
          title={`preview-${row.message_id}`}
          srcDoc={row.body_html}
          sandbox=""
          className="w-full h-[420px] rounded border border-border bg-white"
        />
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Corpo do e-mail não disponível (envio antigo).
        </p>
      )}
    </div>
  );
}

function EmailsAdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [hours, setHours] = useState(168);
  const [template, setTemplate] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!authLoading) {
      if (!user) nav({ to: "/auth" });
      else if (!isAdmin) nav({ to: "/" });
    }
  }, [authLoading, user, isAdmin, nav]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [hours, template, status, debouncedSearch]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getEmailLogs({
        data: {
          hours,
          template: template || undefined,
          status: status || undefined,
          search: debouncedSearch || undefined,
          page,
          pageSize,
        },
      });
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, hours, template, status, debouncedSearch, page, pageSize]);

  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(() => load(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, hours, template, status, debouncedSearch, page, pageSize]);

  const stats = data?.stats ?? { total: 0, sent: 0, pending: 0, failed: 0, suppressed: 0 };
  const groups: Group[] = data?.groups ?? [];
  const templates: string[] = data?.templates ?? [];
  const pagination = data?.pagination ?? { page: 1, totalPages: 1, totalGroups: 0 };

  const showErrorColumn = useMemo(
    () => groups.some((g) => g.items.some((i) => i.error_message)),
    [groups],
  );

  if (authLoading || !isAdmin) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
  }

  const toggleGroup = (k: string) => setExpanded((p) => ({ ...p, [k]: !p[k] }));
  const togglePreview = (k: string) => setPreviewOpen((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4">
          <Link to="/admin" className="text-sm font-bold uppercase tracking-widest">
            ← Sevii Admin
          </Link>
          <h1 className="text-sm font-semibold">Monitor de e-mails</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <ScheduleEmailSettings />
        <ManualEmailComposer onSent={() => setTimeout(() => load(), 1500)} />

        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.hours}
              onClick={() => setHours(r.hours)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${hours === r.hours ? "bg-foreground text-background border-foreground" : "border-border hover:bg-secondary"}`}
            >
              {r.label}
            </button>
          ))}
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
          >
            <option value="">Todos os templates</option>
            {templates.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
          >
            <option value="">Todos os status</option>
            <option value="sent">Enviado</option>
            <option value="pending">Pendente</option>
            <option value="failed">Falhou</option>
            <option value="suppressed">Suprimido</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar destinatário, template ou assunto..."
            className="flex-1 min-w-[220px] rounded-md border border-border bg-background px-3 py-1.5 text-xs"
          />
          <button
            onClick={() => load()}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
          >
            Atualizar
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total, color: "" },
            { label: "Enviados", value: stats.sent, color: "text-green-700" },
            { label: "Pendentes", value: stats.pending, color: "text-yellow-700" },
            { label: "Falhas", value: stats.failed, color: "text-red-700" },
            { label: "Suprimidos", value: stats.suppressed, color: "text-gray-700" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3 w-8"></th>
                <th className="text-left p-3">Template</th>
                <th className="text-left p-3">Destinatário / Nº</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Quando</th>
                {showErrorColumn && <th className="text-left p-3">Erro</th>}
                <th className="text-left p-3 w-16">Ver</th>
              </tr>
            </thead>
            <tbody>
              {loading && groups.length === 0 ? (
                <tr><td colSpan={showErrorColumn ? 7 : 6} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>
              ) : groups.length === 0 ? (
                <tr><td colSpan={showErrorColumn ? 7 : 6} className="p-6 text-center text-muted-foreground">Nenhum e-mail no período.</td></tr>
              ) : groups.map((g) => {
                const isGroup = g.recipients_count > 1;
                const single = !isGroup ? g.items[0] : null;
                const isExpanded = !!expanded[g.key];
                const isPreview = !!previewOpen[g.key];
                const consolidated = Object.entries(g.status_counts)
                  .map(([s, n]) => `${n} ${s}`)
                  .join(", ");
                return (
                  <Fragment key={g.key}>

                    <tr key={g.key} className="border-t border-border">
                      <td className="p-3">
                        {isGroup && (
                          <button
                            onClick={() => toggleGroup(g.key)}
                            className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-secondary"
                            aria-label={isExpanded ? "Recolher" : "Expandir"}
                          >
                            {isExpanded ? "▾" : "▸"}
                          </button>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs">{g.template_name}</td>
                      <td className="p-3 text-xs">
                        {isGroup ? (
                          <span className="font-semibold">{g.recipients_count} destinatários</span>
                        ) : (
                          single!.recipient_email
                        )}
                      </td>
                      <td className="p-3">
                        {isGroup ? (
                          <span className="text-xs font-semibold">{consolidated}</span>
                        ) : (
                          <StatusBadge s={single!.status} />
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(g.created_at).toLocaleString("pt-BR")}
                      </td>
                      {showErrorColumn && (
                        <td className="p-3 text-xs text-red-700 max-w-xs truncate" title={single?.error_message ?? ""}>
                          {!isGroup ? (single?.error_message ?? "") : ""}
                        </td>
                      )}
                      <td className="p-3">
                        {!isGroup && (
                          <button
                            onClick={() => togglePreview(g.key)}
                            className="rounded border border-border px-2 py-0.5 text-xs hover:bg-secondary"
                            title="Pré-visualizar corpo do e-mail"
                          >
                            {isPreview ? "Ocultar" : "👁"}
                          </button>
                        )}
                      </td>
                    </tr>

                    {!isGroup && isPreview && single && (
                      <tr key={`${g.key}-preview`} className="border-t border-border bg-muted/20">
                        <td colSpan={showErrorColumn ? 7 : 6} className="p-3">
                          <PreviewPanel row={single} />
                        </td>
                      </tr>
                    )}

                    {isGroup && isExpanded && (
                      <tr key={`${g.key}-children`} className="border-t border-border bg-muted/10">
                        <td colSpan={showErrorColumn ? 7 : 6} className="p-3">
                          <table className="w-full text-xs">
                            <thead className="text-muted-foreground uppercase tracking-wider">
                              <tr>
                                <th className="text-left p-2">Destinatário</th>
                                <th className="text-left p-2">Status</th>
                                <th className="text-left p-2">Quando</th>
                                {showErrorColumn && <th className="text-left p-2">Erro</th>}
                                <th className="text-left p-2 w-16">Ver</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.items.map((it) => {
                                const childKey = `${g.key}::${it.message_id}`;
                                const childOpen = !!previewOpen[childKey];
                                return (
                                  <Fragment key={childKey}>
                                    <tr key={childKey} className="border-t border-border/60">
                                      <td className="p-2">{it.recipient_email}</td>
                                      <td className="p-2"><StatusBadge s={it.status} /></td>
                                      <td className="p-2 text-muted-foreground">
                                        {new Date(it.created_at).toLocaleTimeString("pt-BR")}
                                      </td>
                                      {showErrorColumn && (
                                        <td className="p-2 text-red-700 max-w-xs truncate" title={it.error_message ?? ""}>
                                          {it.error_message ?? ""}
                                        </td>
                                      )}
                                      <td className="p-2">
                                        <button
                                          onClick={() => togglePreview(childKey)}
                                          className="rounded border border-border px-2 py-0.5 hover:bg-secondary"
                                        >
                                          {childOpen ? "Ocultar" : "👁"}
                                        </button>
                                      </td>
                                    </tr>
                                    {childOpen && (
                                      <tr key={`${childKey}-p`} className="bg-background">
                                        <td colSpan={showErrorColumn ? 5 : 4} className="p-2">
                                          <PreviewPanel row={it} />
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <p>Atualiza automaticamente a cada 15 segundos.</p>
          <div className="flex items-center gap-2">
            <span>
              Página {pagination.page} de {pagination.totalPages} · {pagination.totalGroups} grupos
            </span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-border px-2 py-1 disabled:opacity-40 hover:bg-secondary"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="rounded border border-border px-2 py-1 disabled:opacity-40 hover:bg-secondary"
            >
              Próxima
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
