import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getMyStack, getStackById } from "@/lib/card-stack.functions";
import {
  createServiceOrderRequest,
  checkServiceOrderStatus,
} from "@/lib/service-orders.functions";
import { getShippingQuotes } from "@/utils/shipping.functions";
import { validateArteEmCardsCode, getMyArteEmCardsCode } from "@/lib/arte-em-cards.functions";
import { Loader2, Copy, Check, QrCode } from "lucide-react";
import { EventSlotPicker, type EventSelection } from "@/components/EventSlotPicker";
import { listActiveEvents } from "@/lib/events.functions";
import { validateEventSchedule, type PickupEvent } from "@/lib/events";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import logoUrl from "@/assets/logo.webp";

export const Route = createFileRoute("/pilha/solicitar")({
  validateSearch: (search: { items?: string; stack?: string }): { items?: string; stack?: string } => ({
    items: typeof search.items === "string" ? search.items : undefined,
    stack: typeof search.stack === "string" ? search.stack : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Solicitar envio — Pilha de Cartas" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SolicitarPage,
});

type Method = "correios" | "app" | "arte_em_cards" | "presencial" | "evento";

interface Quote {
  id: string;
  serviceId: number;
  serviceName: string;
  company: string;
  priceCents: number;
  deliveryDays: number | null;
}

interface OSResult {
  serviceOrderId: string;
  code: number;
  method: Method;
  amountCents: number;
  pix?: { qrCode: string; qrCodeBase64: string; expiresAt: string };
  paymentUrl?: string;
  whatsappUrl?: string;
}

function SolicitarPage() {
  const search = Route.useSearch();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [method, setMethod] = useState<Method>("correios");

  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [notes, setNotes] = useState("");

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  const [arteCode, setArteCode] = useState("");
  const [arteStatus, setArteStatus] = useState<
    | { state: "idle" }
    | { state: "checking" }
    | { state: "valid"; code: string }
    | { state: "invalid"; reason: string }
  >({ state: "idle" });
  const [arteExisting, setArteExisting] = useState<{ code: string; cycleEnd: string } | null>(null);
  const [pickupPoint, setPickupPoint] = useState<"aruana" | "aeroporto" | null>(null);
  const [eventSel, setEventSel] = useState<EventSelection | null>(null);
  const [pickupEvents, setPickupEvents] = useState<PickupEvent[]>([]);

  useEffect(() => {
    if (method === "evento" && pickupEvents.length === 0) {
      listActiveEvents().then(setPickupEvents).catch(() => {});
    }
  }, [method, pickupEvents.length]);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<OSResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Carrega seleção do sessionStorage
  useEffect(() => {
    try {
      const fromSearch = search.items
        ?.split(",")
        .map((id: string) => id.trim())
        .filter(Boolean);
      if (fromSearch?.length) {
        setSelectedIds(fromSearch);
        return;
      }
      const raw = sessionStorage.getItem("pilha:selectedItems");
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr) && arr.length > 0) setSelectedIds(arr);
      }
    } catch {}
  }, [search.items]);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  const { data: stack } = useQuery({
    queryKey: ["card-stack", user?.id, search.stack ?? null],
    queryFn: () => (search.stack ? getStackById({ data: { stackId: search.stack } }) : getMyStack()),
    enabled: !!user,
  });

  // Pré-preenche endereço do perfil
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, cpf, phone")
        .eq("user_id", user.id)
        .maybeSingle();
      const { data: addr } = await supabase
        .from("addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      setRecipientName(addr?.recipient_name ?? profile?.full_name ?? "");
      setCpf(profile?.cpf ?? "");
      setPhone(profile?.phone ?? "");
      setCep(addr?.cep ?? "");
      setStreet(addr?.street ?? "");
      setNumber(addr?.number ?? "");
      setComplement(addr?.complement ?? "");
      setNeighborhood(addr?.neighborhood ?? "");
      setCity(addr?.city ?? "");
      setState(addr?.state ?? "");
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await getMyArteEmCardsCode({});
        if (r.hasCode) setArteExisting({ code: r.code, cycleEnd: r.cycleEnd });
      } catch {}
    })();
  }, [user]);

  // Vindo do e-mail de fim de prazo: seleciona todas as cartas da pilha
  useEffect(() => {
    if (search.stack && !search.items && stack?.items?.length) {
      setSelectedIds(stack.items.map((i) => i.id));
    }
  }, [search.stack, search.items, stack]);

  const selectedItems = useMemo(
    () => (stack?.items ?? []).filter((i) => selectedIds.includes(i.id)),
    [stack, selectedIds],
  );
  const totalQty = selectedItems.reduce((s, i) => s + i.quantity, 0);
  const hasSealedSelected = selectedItems.some((i: any) =>
    typeof i.cardId === "string" && i.cardId.startsWith("sealed:"),
  );

  // Se houver produto lacrado, "Arte em Cards" não é permitido. Volta para Correios.
  useEffect(() => {
    if (hasSealedSelected && method === "arte_em_cards") {
      setMethod("correios");
      toast.info("Retirada na Arte em Cards não está disponível para produtos lacrados.");
    }
  }, [hasSealedSelected, method]);

  const fetchQuotes = async (cepValue: string) => {
    const clean = cepValue.replace(/\D/g, "");
    if (clean.length !== 8 || totalQty === 0) return;
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const r = await getShippingQuotes({ data: { destinationCep: clean, itemsCount: totalQty } });
      if (r.error) {
        setQuotesError(r.error);
        setQuotes([]);
        setSelectedQuoteId(null);
      } else {
        setQuotes(r.quotes);
        setSelectedQuoteId(r.quotes[0]?.id ?? null);
      }
    } catch (e: any) {
      setQuotesError(e?.message ?? "Falha ao consultar frete.");
    } finally {
      setQuotesLoading(false);
    }
  };

  useEffect(() => {
    if (method === "correios" && cep.replace(/\D/g, "").length === 8 && totalQty > 0 && quotes.length === 0) {
      fetchQuotes(cep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, cep, totalQty]);

  const lookupCep = async (value: string) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const j = await r.json();
      if (!j.erro) {
        setStreet(j.logradouro || street);
        setNeighborhood(j.bairro || neighborhood);
        setCity(j.localidade || city);
        setState(j.uf || state);
      }
    } catch {}
    fetchQuotes(clean);
  };

  const handleValidateArte = async () => {
    const code = arteCode.trim().toUpperCase();
    if (!code) {
      setArteStatus({ state: "invalid", reason: "Informe o código." });
      return;
    }
    setArteStatus({ state: "checking" });
    try {
      const r = await validateArteEmCardsCode({ data: { code } });
      if (r.valid) setArteStatus({ state: "valid", code: r.code });
      else setArteStatus({ state: "invalid", reason: r.reason });
    } catch (e: any) {
      setArteStatus({ state: "invalid", reason: e?.message ?? "Erro" });
    }
  };

  const selectedQuote = quotes.find((q) => q.id === selectedQuoteId) ?? null;
  const shippingCents = method === "correios" ? (selectedQuote?.priceCents ?? 0) : 0;
  const hasValidArteCode =
    method === "arte_em_cards" &&
    (!!arteExisting || (arteStatus.state === "valid" && arteStatus.code === arteCode.trim().toUpperCase()));
  const arteApplies = method === "arte_em_cards" && !hasValidArteCode;
  const arteCents = arteApplies ? 500 : 0;
  const totalCents = shippingCents + arteCents;
  let arteCodeForSubmit: string | null = null;
  if (method === "arte_em_cards") {
    const existing = arteExisting?.code;
    const validated = arteStatus.state === "valid" ? arteStatus.code : arteCode.trim().toUpperCase();
    const resolved = existing ?? validated;
    arteCodeForSubmit = resolved ? resolved : null;
  }

  const handleSubmit = async () => {
    setErr(null);
    if (selectedIds.length === 0) {
      setErr("Nenhuma carta selecionada.");
      return;
    }
    if (method === "correios") {
      if (!selectedQuote) {
        setErr("Selecione uma cotação de frete.");
        return;
      }
      if (!recipientName || !cep || !street || !number || !neighborhood || !city || !state || !phone) {
        setErr("Preencha todos os campos do endereço.");
        return;
      }
    }
    if (method === "evento") {
      if (!eventSel) {
        setErr("Escolha o evento, o dia e o horário da retirada.");
        return;
      }
      const ev = pickupEvents.find((e) => e.id === eventSel.eventId);
      const eventErr = ev ? validateEventSchedule(ev, eventSel.ymd, eventSel.slot) : "Evento não encontrado.";
      if (eventErr) {
        if (ev) setEventSel(null);
        setErr(eventErr);
        return;
      }
    }
    if (method === "presencial" && !pickupPoint) {
      setErr("Selecione o ponto de retirada (Aruana ou Aeroporto).");
      return;
    }
    if (method === "arte_em_cards" && arteApplies) {
      if (!recipientName.trim()) {
        setErr("Informe o nome completo para gerar o Pix.");
        return;
      }
      if (cpf.replace(/\D/g, "").length !== 11) {
        setErr("Informe um CPF válido (11 dígitos) para gerar o Pix de R$ 5,00.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const r = await createServiceOrderRequest({
        data: {
          itemIds: selectedIds,
          method,
          shippingQuote:
            method === "correios" && selectedQuote
              ? {
                  serviceId: String(selectedQuote.serviceId),
                  serviceName: selectedQuote.serviceName,
                  company: selectedQuote.company,
                  priceCents: selectedQuote.priceCents,
                }
              : null,
          address:
            method === "correios"
              ? {
                  recipientName,
                  phone,
                  cep,
                  street,
                  number,
                  complement: complement || null,
                  neighborhood,
                  city,
                  state: state.toUpperCase(),
                }
              : null,
          arteEmCardsCode: arteCodeForSubmit,
          pickupPoint: method === "presencial" ? pickupPoint : null,
          eventName: null,
          eventId: method === "evento" ? (eventSel?.eventId ?? null) : null,
          eventAt: method === "evento" ? (eventSel?.iso ?? null) : null,
          notes: notes || null,
          cpf: cpf || null,
        },
      });
      const resultData = r as OSResult;
      setResult(resultData);
      try { sessionStorage.removeItem("pilha:selectedItems"); } catch {}
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (resultData.paymentUrl) {
        window.location.href = resultData.paymentUrl;
      } else if (resultData.whatsappUrl) {
        window.location.href = resultData.whatsappUrl;
      }
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao criar solicitação.");
    } finally {
      setSubmitting(false);
    }
  };

  // Polling Pix
  useEffect(() => {
    if (!result?.pix) return;
    const id = setInterval(async () => {
      try {
        const r = await checkServiceOrderStatus({ data: { serviceOrderId: result.serviceOrderId } });
        if (r.status === "paid") {
          clearInterval(id);
          toast.success("Pagamento confirmado!");
          nav({ to: "/pilha" });
        }
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [result, nav]);

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={logoUrl} alt="Sevii" className="h-12 w-auto sm:h-14" />
          </Link>
          <Link to="/pilha" className="text-xs font-semibold uppercase tracking-widest hover:underline">
            ← Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold mb-1">Solicitar Retirada / Envio</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {selectedIds.length} carta(s) selecionada(s) · {totalQty} unidade(s)
        </p>

        {result ? (
          <ResultView result={result} />
        ) : (
          <>
            <section className="rounded-xl border border-border bg-card p-5 mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-widest mb-3">Forma de envio</h2>
              <div className="space-y-2">
                {(
                  [
                    { v: "correios", label: "📦 Correios (Mini Envios)", desc: "Cobrança do frete via Pix" },
                    { v: "app", label: "🛵 Entrega em mãos (somente em Aracaju)", desc: "Entregador parceiro às quintas, a partir das 19h — taxa R$ 15, combinar via WhatsApp" },
                    { v: "presencial", label: "🏪 Retirada Presencial", desc: "Aruana ou Aeroporto — gratuito" },
                    { v: "evento", label: "🎪 Retirada em Eventos", desc: "Retire no evento que você vai comparecer — gratuito" },
                    
                  ] as { v: Method; label: string; desc: string }[]
                ).map((opt) => {
                  const disabled = opt.v === "arte_em_cards" && hasSealedSelected;
                  return (
                    <label
                      key={opt.v}
                      className={`flex items-start gap-3 rounded-lg border border-border p-3 ${
                        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-secondary/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="method"
                        value={opt.v}
                        checked={method === opt.v}
                        onChange={() => !disabled && setMethod(opt.v)}
                        disabled={disabled}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {disabled ? "Não disponível para produtos lacrados." : opt.desc}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            {method === "correios" && (
              <section className="rounded-xl border border-border bg-card p-5 mb-6 space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest">Endereço de envio</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <input className="border rounded-md px-3 py-2 text-sm" placeholder="Nome completo" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
                  <input className="border rounded-md px-3 py-2 text-sm" placeholder="WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  <input
                    className="border rounded-md px-3 py-2 text-sm"
                    placeholder="CEP"
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                    onBlur={(e) => lookupCep(e.target.value)}
                  />
                  <input className="border rounded-md px-3 py-2 text-sm" placeholder="Rua" value={street} onChange={(e) => setStreet(e.target.value)} />
                  <input className="border rounded-md px-3 py-2 text-sm" placeholder="Número" value={number} onChange={(e) => setNumber(e.target.value)} />
                  <input className="border rounded-md px-3 py-2 text-sm" placeholder="Complemento" value={complement} onChange={(e) => setComplement(e.target.value)} />
                  <input className="border rounded-md px-3 py-2 text-sm" placeholder="Bairro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
                  <input className="border rounded-md px-3 py-2 text-sm" placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} />
                  <input className="border rounded-md px-3 py-2 text-sm" placeholder="UF" maxLength={2} value={state} onChange={(e) => setState(e.target.value)} />
                  <input className="border rounded-md px-3 py-2 text-sm" placeholder="CPF (para Pix)" value={cpf} onChange={(e) => setCpf(e.target.value)} />
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mt-3 mb-2">Frete</p>
                  {quotesLoading && <p className="text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin mr-1" /> Calculando...</p>}
                  {quotesError && <p className="text-xs text-red-700">{quotesError}</p>}
                  {!quotesLoading && quotes.length === 0 && !quotesError && (
                    <p className="text-xs text-muted-foreground">Informe o CEP para calcular o frete.</p>
                  )}
                  <div className="space-y-1.5 mt-1">
                    {quotes.map((q) => (
                      <label key={q.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 cursor-pointer hover:bg-secondary/30">
                        <div className="flex items-center gap-2">
                          <input type="radio" checked={selectedQuoteId === q.id} onChange={() => setSelectedQuoteId(q.id)} />
                          <span className="text-sm">{q.company} · {q.serviceName}{q.deliveryDays ? ` · ${q.deliveryDays}d` : ""}</span>
                        </div>
                        <span className="text-sm font-semibold">R$ {(q.priceCents / 100).toFixed(2).replace(".", ",")}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {method === "arte_em_cards" && (
              <section className="rounded-xl border border-border bg-card p-5 mb-6 space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest">Código Arte em Cards (opcional)</h2>
                {arteExisting && (
                  <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2">
                    Você possui código ativo: <span className="font-mono font-semibold">{arteExisting.code}</span>. Ele será aplicado automaticamente.
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded-md px-3 py-2 text-sm font-mono uppercase"
                    placeholder="AEC-XXXXXXXX"
                    value={arteCode}
                    onChange={(e) => setArteCode(e.target.value.toUpperCase())}
                  />
                  <button type="button" onClick={handleValidateArte} className="rounded-md bg-secondary px-4 py-2 text-xs font-semibold uppercase tracking-wide">
                    Validar
                  </button>
                </div>
                {arteStatus.state === "valid" && <p className="text-xs text-emerald-700">✓ Código válido — taxa isenta</p>}
                {arteStatus.state === "invalid" && <p className="text-xs text-red-700">{arteStatus.reason}</p>}

                {arteApplies && (
                  <div className="pt-3 border-t border-border space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-widest">Dados para o Pix (R$ 5,00)</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input className="border rounded-md px-3 py-2 text-sm" placeholder="Nome completo" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
                      <input className="border rounded-md px-3 py-2 text-sm" placeholder="CPF (obrigatório p/ Pix)" value={cpf} onChange={(e) => setCpf(e.target.value)} />
                    </div>
                  </div>
                )}
              </section>
            )}

            {method === "app" && (
              <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 mb-6">
                <p className="text-sm">
                  Após criar a solicitação, você será direcionado ao WhatsApp da loja para combinar disponibilidade e custo do aplicativo de entrega.
                </p>
              </section>
            )}

            {method === "presencial" && (
              <section className="rounded-xl border border-border bg-card p-5 mb-6 space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-widest">Ponto de retirada</h2>
                <p className="text-xs text-muted-foreground mb-2">
                  Retirada gratuita. Horário: 14h às 18h em dias úteis, mediante contato com 24h de antecedência.
                </p>
                <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-secondary/30">
                  <input type="radio" name="pickup" checked={pickupPoint === "aruana"} onChange={() => setPickupPoint("aruana")} className="mt-1" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Aruana</p>
                    <p className="text-xs text-muted-foreground">Rua Josepha Andrade Irmã Fontes, 600 — Residencial Vista Aruana</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-secondary/30">
                  <input type="radio" name="pickup" checked={pickupPoint === "aeroporto"} onChange={() => setPickupPoint("aeroporto")} className="mt-1" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Aeroporto</p>
                    <p className="text-xs text-muted-foreground">Av. Silvério Leite Fontes, 1128 — Palm Ville Residence</p>
                  </div>
                </label>
              </section>
            )}

            {method === "evento" && (
              <section className="rounded-xl border border-border bg-card p-5 mb-6 space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-widest">Escolha o evento, o dia e o horário</h2>
                <EventSlotPicker events={pickupEvents} value={eventSel} onChange={setEventSel} />
              </section>
            )}

            <section className="rounded-xl border border-border bg-card p-5 mb-6">
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[64px]"
                placeholder="Observações (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </section>

            <div className="rounded-xl border border-border bg-card p-5 mb-6">
              <div className="flex justify-between text-sm">
                <span>Total a pagar agora</span>
                <span className="font-bold">R$ {(totalCents / 100).toFixed(2).replace(".", ",")}</span>
              </div>
              {method === "app" && totalCents === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Sem cobrança online — combinar via WhatsApp.</p>
              )}
            </div>

            {err && <p className="text-sm text-red-700 mb-4">{err}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-full bg-foreground px-5 py-3 text-sm font-semibold uppercase tracking-wide text-background disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {method === "app" ? "Criar solicitação" : totalCents > 0 ? "Gerar Pix" : (method === "presencial" || method === "evento" ? "Confirmar retirada" : "Confirmar solicitação")}
            </button>
          </>
        )}
      </main>
    </div>
  );

  function ResultView({ result }: { result: OSResult }) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-bold">
          {result.pix ? "Checkout da solicitação" : `OS #${result.code} criada ✓`}
        </h2>

        {result.pix && (
          <>
            <p className="text-sm">
              OS #{result.code} criada. Pague o Pix abaixo para concluir a solicitação. Esta página atualiza sozinha quando o pagamento for confirmado.
            </p>
            <div className="grid place-items-center">
              <img src={`data:image/png;base64,${result.pix.qrCodeBase64}`} alt="QR Pix" className="h-56 w-56" />
            </div>
            <div className="flex items-center gap-2">
              <input readOnly value={result.pix.qrCode} className="flex-1 border rounded-md px-3 py-2 text-xs font-mono" />
              <button
                type="button"
                onClick={async () => {
                  await copyToClipboard(result.pix!.qrCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="rounded-md bg-secondary px-3 py-2 text-xs font-semibold inline-flex items-center gap-1"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><QrCode className="h-3 w-3" /> Total R$ {(result.amountCents / 100).toFixed(2).replace(".", ",")}</p>
            {result.paymentUrl && (
              <a
                href={result.paymentUrl}
                className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-2 text-xs font-semibold uppercase tracking-wide text-background"
              >
                Abrir página de cobrança
              </a>
            )}
          </>
        )}

        {result.whatsappUrl && (
          <div className="space-y-3">
            <p className="text-sm">Solicitação registrada. Continue no WhatsApp para combinar o aplicativo de entrega:</p>
            <a
              href={result.whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-700 px-6 py-3 text-sm font-semibold text-white"
            >
              Abrir WhatsApp da loja
            </a>
          </div>
        )}

        {!result.pix && !result.whatsappUrl && (
          <p className="text-sm text-emerald-700">Solicitação registrada com sucesso.</p>
        )}

        <div className="pt-3 border-t">
          <Link to="/pilha" className="text-xs font-semibold uppercase tracking-widest hover:underline">
            ← Voltar para a pilha
          </Link>
        </div>
      </section>
    );
  }
}
