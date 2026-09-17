import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCardsCache } from "@/hooks/useCardsCatalog";
import { CONDITION_LABEL } from "@/data/cards";
import type { Condition } from "@/data/cards";
import { Minus, Plus, Search, Trash2, PackageCheck, Undo2, Power, Home, PackagePlus, ClipboardList, MessageSquare } from "lucide-react";
import { EVENT_MODE_KEY, useEventMode } from "@/lib/event-mode";
import { PopupPreview } from "@/components/admin/PopupPreview";

const EVENT_POPUP_TITLE = "Estamos em evento";

function formatReturnDate(value: string) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export const Route = createFileRoute("/admin/evento")({
  head: () => ({
    meta: [
      { title: "Modo Evento — Admin Sevii" },
      { name: "description", content: "Baixa de estoque em lote das vendas feitas em eventos presenciais." },
    ],
  }),
  component: EventoPage,
});

interface Row {
  id: string;
  name: string;
  collection: string;
  card_number: string;
  language: string;
  finish: string;
  condition: Condition;
  liga_subcategory: string | null;
  stock: number;
  event_reserved: number;
  base_price_cents: number | null;
  image: string | null;
}

type Mode = "sales" | "reserve";

function variantLabel(r: Row) {
  const parts = [r.finish === "Liga" && r.liga_subcategory ? `Liga · ${r.liga_subcategory}` : r.finish, r.language, r.condition];
  return parts.filter(Boolean).join(" · ");
}

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function EventoPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [mode, setMode] = useState<Mode>("sales");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [reserve, setReserve] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [atEvent, setAtEvent] = useState<Row[]>([]);
  const { eventMode, reload: reloadEventMode } = useEventMode();
  const [eventMessage, setEventMessage] = useState("");
  const [savingMode, setSavingMode] = useState(false);

  // Pop-up de aviso do evento
  const [popupId, setPopupId] = useState<string | null>(null);
  const [popupTitle, setPopupTitle] = useState(EVENT_POPUP_TITLE);
  const [popupText, setPopupText] = useState(
    "Estamos participando de um evento presencial e as vendas online estão pausadas.",
  );
  const [popupReturnDate, setPopupReturnDate] = useState("");
  const [popupActive, setPopupActive] = useState(false);
  const [popupWhats, setPopupWhats] = useState(true);
  const [savingPopup, setSavingPopup] = useState(false);

  const popupBodyHtml = useMemo(() => {
    const text = popupText.trim().replace(/\n/g, "<br />");
    const back = popupReturnDate
      ? `<p style="text-align:center"><strong>Voltamos a vender no site em ${formatReturnDate(popupReturnDate)}.</strong></p>`
      : "";
    return `<p style="text-align:center">${text}</p>${back}`;
  }, [popupText, popupReturnDate]);

  const popupPreviewData = useMemo(
    () => ({
      title: popupTitle,
      body_html: popupBodyHtml,
      image_url: null,
      link_url: null,
      icon_key: "warning",
      button_enabled: popupWhats,
      button_label: "Falar no WhatsApp",
      button_action: "whatsapp",
      button_target: null,
    }),
    [popupTitle, popupBodyHtml, popupWhats],
  );

  const loadEventPopup = async () => {
    const { data } = await supabase
      .from("site_popups")
      .select("id, title, body_html, active, button_enabled, ends_at")
      .eq("title", EVENT_POPUP_TITLE)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return;
    const p = data as any;
    setPopupId(p.id);
    setPopupTitle(p.title);
    setPopupActive(!!p.active);
    setPopupWhats(!!p.button_enabled);
    const plain = String(p.body_html ?? "")
      .replace(/<p[^>]*><strong>Voltamos[\s\S]*?<\/strong><\/p>/i, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (plain) setPopupText(plain);
    const m = /Voltamos a vender no site em (\d{2})\/(\d{2})\/(\d{4})/.exec(String(p.body_html ?? ""));
    if (m) setPopupReturnDate(`${m[3]}-${m[2]}-${m[1]}`);
  };

  useEffect(() => { if (isAdmin) loadEventPopup(); }, [isAdmin]);

  const saveEventPopup = async (active: boolean) => {
    if (!popupText.trim()) { setMsg({ type: "err", text: "Escreva a mensagem do pop-up." }); return; }
    setSavingPopup(true);
    setMsg(null);
    const payload = {
      title: popupTitle.trim() || EVENT_POPUP_TITLE,
      body_html: popupBodyHtml,
      image_url: null,
      link_url: null,
      active,
      show_on_notices: true,
      icon_key: "warning",
      button_enabled: popupWhats,
      button_label: "Falar no WhatsApp",
      button_action: popupWhats ? "whatsapp" : "close",
      button_target: null,
      ends_at: popupReturnDate ? new Date(`${popupReturnDate}T23:59:59`).toISOString() : null,
    };
    const { data, error } = popupId
      ? await supabase.from("site_popups").update(payload).eq("id", popupId).select("id").maybeSingle()
      : await supabase.from("site_popups").insert(payload).select("id").maybeSingle();
    setSavingPopup(false);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    if (data?.id) setPopupId(data.id as string);
    setPopupActive(active);
    setMsg({
      type: "ok",
      text: active ? "Pop-up publicado — os clientes verão o aviso ao entrar no site." : "Pop-up desativado.",
    });
  };


  useEffect(() => { setEventMessage(eventMode.message); }, [eventMode.message]);

  const toggleEventMode = async (enabled: boolean) => {
    setSavingMode(true);
    setMsg(null);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: EVENT_MODE_KEY, value: { enabled, message: eventMessage.trim() } }, { onConflict: "key" });
    setSavingMode(false);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    await reloadEventMode();
    setMsg({ type: "ok", text: enabled ? "Modo evento ativado — vendas online bloqueadas." : "Vendas online liberadas." });
  };

  useEffect(() => {
    if (!authLoading) {
      if (!user) nav({ to: "/auth" });
      else if (!isAdmin) nav({ to: "/" });
    }
  }, [authLoading, user, isAdmin, nav]);

  const loadAtEvent = async () => {
    const { data } = await supabase
      .from("cards")
      .select("id, name, collection, card_number, language, finish, condition, liga_subcategory, stock, event_reserved, base_price_cents, image")
      .gt("event_reserved", 0)
      .order("name");
    setAtEvent((data ?? []) as unknown as Row[]);
  };

  useEffect(() => { if (isAdmin) loadAtEvent(); }, [isAdmin]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setRows([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("id, name, collection, card_number, language, finish, condition, liga_subcategory, stock, event_reserved, base_price_cents, image")
        .or(`name.ilike.%${term}%,card_number.ilike.%${term}%`)
        .order("name")
        .limit(60);
      if (cancelled) return;
      if (error) setMsg({ type: "err", text: error.message });
      setRows((data ?? []) as unknown as Row[]);
      setLoading(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const cartRowsSource = useMemo(() => {
    const byId = new Map<string, Row>();
    for (const r of [...rows, ...atEvent]) byId.set(r.id, r);
    return byId;
  }, [rows, atEvent]);

  const cartEntries = useMemo(
    () => Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ row: cartRowsSource.get(id), qty: q })).filter((e): e is { row: Row; qty: number } => !!e.row),
    [cart, cartRowsSource],
  );

  const cartTotalCards = cartEntries.reduce((s, e) => s + e.qty, 0);
  const cartTotalValue = cartEntries.reduce((s, e) => s + e.qty * (e.row.base_price_cents ?? 0), 0);

  const addToCart = (r: Row, delta: number) => {
    setCart((c) => {
      const next = Math.min(Math.max((c[r.id] ?? 0) + delta, 0), r.stock);
      const copy = { ...c };
      if (next === 0) delete copy[r.id]; else copy[r.id] = next;
      return copy;
    });
  };

  const confirmSales = async () => {
    if (cartEntries.length === 0) return;
    if (!confirm(`Confirmar baixa de ${cartTotalCards} carta(s) vendidas no evento?`)) return;
    setSaving(true);
    setMsg(null);
    const { error } = await (supabase as any).rpc("apply_event_stock_sales", {
      _items: cartEntries.map((e) => ({ card_id: e.row.id, quantity: e.qty })),
      _reason: "Venda em evento",
    });
    setSaving(false);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    setCart({});
    invalidateCardsCache();
    setMsg({ type: "ok", text: `Baixa aplicada: ${cartTotalCards} carta(s) · ${brl(cartTotalValue)}.` });
    setQuery((q) => q);
    await loadAtEvent();
    setRows((rs) => rs.map((r) => {
      const e = cartEntries.find((x) => x.row.id === r.id);
      return e ? { ...r, stock: Math.max(r.stock - e.qty, 0), event_reserved: Math.max(Math.min(r.event_reserved, r.stock) - e.qty, 0) } : r;
    }));
  };

  const saveReserve = async () => {
    const items = Object.entries(reserve).map(([id, q]) => ({ card_id: id, quantity: q }));
    if (items.length === 0) return;
    setSaving(true);
    setMsg(null);
    const { error } = await (supabase as any).rpc("set_event_reserved", { _items: items });
    setSaving(false);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    setReserve({});
    invalidateCardsCache();
    setMsg({ type: "ok", text: "Quantidades levadas ao evento atualizadas — o site não vende essas unidades." });
    await loadAtEvent();
  };

  const endEvent = async () => {
    if (!confirm("Encerrar evento? Todo o estoque marcado como 'no evento' volta a ser vendido no site.")) return;
    setSaving(true);
    const { error } = await (supabase as any).rpc("clear_event_reserved");
    setSaving(false);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    invalidateCardsCache();
    setMsg({ type: "ok", text: "Evento encerrado. Estoque liberado no site." });
    await loadAtEvent();
  };

  if (authLoading || !isAdmin) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-foreground">Modo Evento</h1>
        <p className="text-sm text-muted-foreground">
          Marque o que foi levado ao evento (bloqueia a venda no site) e dê baixa em lote no que foi vendido lá.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary"
        >
          <Home className="h-3.5 w-3.5" /> Página inicial
        </Link>
        <Link
          to="/admin/manage-cards"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary"
        >
          <PackagePlus className="h-3.5 w-3.5" /> Cadastrar carta
        </Link>
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary"
        >
          <ClipboardList className="h-3.5 w-3.5" /> Pedidos
        </Link>
      </div>

      <section className={`rounded-xl border p-4 space-y-3 ${eventMode.enabled ? "border-destructive/50 bg-destructive/10" : "border-border bg-card"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Power className="h-4 w-4" /> Bloqueio de vendas online
            </h2>
            <p className="text-xs text-muted-foreground">
              {eventMode.enabled
                ? "Modo evento ATIVO: o site não aceita novos pedidos."
                : "Modo evento desativado: as vendas online estão liberadas."}
            </p>
          </div>
          <button
            type="button"
            disabled={savingMode}
            onClick={() => toggleEventMode(!eventMode.enabled)}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50 ${eventMode.enabled ? "bg-emerald-600 hover:bg-emerald-700" : "bg-destructive hover:bg-destructive/90"}`}
          >
            {savingMode ? "Salvando…" : eventMode.enabled ? "Liberar vendas" : "Ativar modo evento"}
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground">Mensagem exibida aos clientes</label>
          <textarea
            value={eventMessage}
            onChange={(e) => setEventMessage(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-background p-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            disabled={savingMode}
            onClick={() => toggleEventMode(eventMode.enabled)}
            className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
          >
            Salvar mensagem
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">

        <button
          type="button"
          onClick={() => setMode("sales")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${mode === "sales" ? "bg-foreground text-background" : "bg-secondary text-foreground"}`}
        >
          Baixa de vendas
        </button>
        <button
          type="button"
          onClick={() => setMode("reserve")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${mode === "reserve" ? "bg-foreground text-background" : "bg-secondary text-foreground"}`}
        >
          Estoque levado ao evento
        </button>
      </div>

      {msg && (
        <div className={`rounded-md border px-3 py-2 text-xs font-medium ${msg.type === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
          {msg.text}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou número da carta…"
          className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-2">
          {loading && <p className="text-xs text-muted-foreground">Buscando…</p>}
          {!loading && query.trim().length >= 2 && rows.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma carta encontrada.</p>
          )}
          {rows.map((r) => {
            const inCart = cart[r.id] ?? 0;
            const reserved = reserve[r.id] ?? r.event_reserved;
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
                {r.image ? (
                  <img src={r.image} alt={r.name} loading="lazy" className="h-14 w-10 rounded object-cover" />
                ) : (
                  <div className="h-14 w-10 rounded bg-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {r.collection} · {r.card_number} · {variantLabel(r)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Estoque: <strong className="text-foreground">{r.stock}</strong>
                    {r.event_reserved > 0 && <> · no evento: <strong className="text-foreground">{r.event_reserved}</strong></>}
                    {r.base_price_cents != null && <> · {brl(r.base_price_cents)}</>}
                  </p>
                </div>

                {mode === "sales" ? (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => addToCart(r, -1)} disabled={inCart === 0}
                      className="rounded-md border border-border p-1.5 text-foreground disabled:opacity-40" aria-label="Remover 1">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-foreground">{inCart}</span>
                    <button type="button" onClick={() => addToCart(r, 1)} disabled={inCart >= r.stock}
                      className="rounded-md border border-border p-1.5 text-foreground disabled:opacity-40" aria-label="Adicionar 1">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-muted-foreground">Levar</label>
                    <input
                      type="number"
                      min={0}
                      max={r.stock}
                      value={reserved}
                      onChange={(e) => setReserve((s) => ({ ...s, [r.id]: Math.min(Math.max(Number(e.target.value) || 0, 0), r.stock) }))}
                      className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <aside className="space-y-4">
          {mode === "sales" ? (
            <div className="rounded-lg border border-border bg-card p-3">
              <h2 className="mb-2 text-sm font-bold text-foreground">Vendidas no evento</h2>
              {cartEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">Busque as cartas e use + para montar a lista. Nada é gravado até confirmar.</p>
              ) : (
                <>
                  <ul className="mb-3 space-y-2">
                    {cartEntries.map(({ row, qty }) => (
                      <li key={row.id} className="flex items-start gap-2 text-xs">
                        <span className="flex-1">
                          <strong className="text-foreground">{qty}×</strong> {row.name}
                          <span className="block text-[10px] text-muted-foreground">{row.collection} · {row.card_number} · {variantLabel(row)}</span>
                        </span>
                        <button type="button" onClick={() => setCart((c) => { const n = { ...c }; delete n[row.id]; return n; })}
                          className="text-muted-foreground hover:text-destructive" aria-label="Remover item">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Total: <strong className="text-foreground">{cartTotalCards} carta(s)</strong> · valor estimado <strong className="text-foreground">{brl(cartTotalValue)}</strong>
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={confirmSales} disabled={saving}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs font-bold text-background disabled:opacity-50">
                      <PackageCheck className="h-4 w-4" /> Confirmar baixa
                    </button>
                    <button type="button" onClick={() => setCart({})} disabled={saving}
                      className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground">
                      Limpar
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-3">
              <h2 className="mb-2 text-sm font-bold text-foreground">No evento agora</h2>
              {atEvent.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma carta bloqueada. Defina as quantidades na busca ao lado.</p>
              ) : (
                <ul className="mb-3 max-h-72 space-y-1 overflow-auto">
                  {atEvent.map((r) => (
                    <li key={r.id} className="text-xs text-muted-foreground">
                      <strong className="text-foreground">{r.event_reserved}×</strong> {r.name}
                      <span className="block text-[10px]">{r.collection} · {r.card_number} · {variantLabel(r)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-2">
                <button type="button" onClick={saveReserve} disabled={saving || Object.keys(reserve).length === 0}
                  className="rounded-md bg-foreground px-3 py-2 text-xs font-bold text-background disabled:opacity-50">
                  Salvar quantidades levadas
                </button>
                <button type="button" onClick={endEvent} disabled={saving || atEvent.length === 0}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50">
                  <Undo2 className="h-4 w-4" /> Encerrar evento e liberar estoque
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Condições: {Object.entries(CONDITION_LABEL).map(([k]) => k).join(" · ")}. O estoque marcado como "no evento" é
            descontado da disponibilidade do site, evitando venda duplicada.
          </p>
        </aside>
      </div>
    </div>
  );
}
