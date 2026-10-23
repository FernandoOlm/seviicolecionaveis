import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { readLinkedAuctionPayment, generateLinkedAuctionPix, checkLinkedAuctionPayment } from "@/lib/auction-payment.functions";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  regeneratePixForOrder,
  payExistingOrderWithCard,
  checkPixOrderStatus,
  getMercadoPagoPublicKey,
} from "@/utils/payments.functions";
import { getMpCustomerForCheckout } from "@/lib/saved-cards.functions";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import { Copy, Check, QrCode, CreditCard, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/pay/$orderId")({
  head: () => ({
    meta: [
      { title: "Pagar pedido — Sevii Colecionáveis" },
      { name: "description", content: "Pagamento seguro de pedidos e arremates na Sevii Colecionáveis." },
      { property: "og:title", content: "Pagar pedido — Sevii Colecionáveis" },
      { property: "og:description", content: "Pagamento seguro de pedidos e arremates na Sevii Colecionáveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PayOrderPage,
});

type Method = "pix" | "card";

interface PixState {
  orderId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  totalCents: number;
}

function PayOrderPage() {
  const { orderId } = Route.useParams();
  const { user, session, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const readLinked = useServerFn(readLinkedAuctionPayment);
  const linkedPix = useServerFn(generateLinkedAuctionPix);
  const authenticatedPix = useServerFn(regeneratePixForOrder);
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const [linkReady, setLinkReady] = useState(false);
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("payment");
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      setPaymentToken(token);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setLinkReady(true);
  }, []);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<Method>("pix");
  const [pix, setPix] = useState<PixState | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (linkReady && !paymentToken && !authLoading && !user) nav({ to: "/auth", search: { redirect: `/pay/${orderId}` } });
  }, [linkReady, paymentToken, authLoading, user, nav, orderId]);

  useEffect(() => {
    if (!linkReady || (!user && !paymentToken)) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (paymentToken) {
        try {
          const data = await readLinked({ data: { orderId, token: paymentToken } });
          if (!cancelled) {
            setOrder(data);
            const expiry = data.pix_expires_at;
            if (data.pix_qr_code && data.pix_qr_code_base64 && expiry && new Date(expiry).getTime() > Date.now()) {
              setPix({ orderId: data.id, qrCode: data.pix_qr_code, qrCodeBase64: data.pix_qr_code_base64, expiresAt: expiry, totalCents: data.total_cents });
            }
          }
        } catch {
          if (!cancelled) setErr("Link inválido ou expirado. Entre na sua conta para pagar este pedido.");
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }
      // Junta pedidos feitos pelo bot do WhatsApp (mesmo telefone) na conta logada
      try { await (supabase as any).rpc("claim_my_whatsapp_orders"); } catch {}
      const { data } = await supabase
        .from("orders")
        .select("id, status, total_cents, payment_method, pix_qr_code, pix_qr_code_base64, pix_expires_at, mercadopago_payment_id, recipient_name")
        .eq("id", orderId)
        .maybeSingle();
      setOrder(data);
      setLoading(false);
      if (data?.payment_method === "pix" && data?.pix_qr_code && data?.pix_qr_code_base64) {
        const exp = data.pix_expires_at ? new Date(data.pix_expires_at).getTime() : 0;
        if (exp > Date.now()) {
          setPix({
            orderId: data.id,
            qrCode: data.pix_qr_code,
            qrCodeBase64: data.pix_qr_code_base64,
            expiresAt: data.pix_expires_at as string,
            totalCents: data.total_cents,
          });
          setMethod("pix");
        }
      } else if (data?.payment_method === "mercadopago_card") {
        setMethod("card");
      }
    })();
    return () => { cancelled = true; };
  }, [user, orderId, paymentToken, linkReady, readLinked]);

  const startPix = async () => {
    setBusy(true);
    setErr(null);
    try {
      const result = paymentToken
        ? await linkedPix({ data: { orderId, token: paymentToken } })
        : await authenticatedPix({ data: { orderId } });
      setPix(result);
      setShowCard(false);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? "Erro ao gerar Pix. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const startCard = () => {
    setShowCard(true);
    setPix(null);
    setMethod("card");
    setErr(null);
  };

  if (!linkReady || authLoading || loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
  }
  if (!user && !paymentToken) return null;
  if (!order) {
    return (
      <div className="min-h-screen grid place-items-center px-4 text-center">
        <div>
          <p className="text-sm text-muted-foreground">{err || "Pedido não encontrado. Confira o WhatsApp em Minha conta ou peça à loja para confirmar o vínculo."}</p>
          <Link to="/auth" search={{ redirect: `/pay/${orderId}` }} className="mt-4 block text-sm font-semibold underline">Entrar na minha conta</Link>
          {user && <Link to="/conta" className="mt-3 block text-sm underline">Conferir cadastro</Link>}
          <Link to="/orders" className="mt-4 inline-block text-sm font-semibold underline">Meus pedidos</Link>
        </div>
      </div>
    );
  }
  if (order.status !== "pending") {
    return (
      <div className="min-h-screen grid place-items-center px-4 text-center">
        <div className="max-w-md space-y-3">
          <p className="text-sm font-semibold">Este pedido já não está mais aguardando pagamento.</p>
          <p className="text-xs text-muted-foreground">{order.status === "pending" ? "Aguardando pagamento" : "Consulte sua conta para acompanhar o pedido."}</p>
          <Link to="/orders/$orderId" params={{ orderId }} className="mt-4 inline-block text-sm font-semibold underline">
            Ver pedido
          </Link>
        </div>
      </div>
    );
  }

  const total = (order.total_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <Link to="/" className="text-sm font-bold uppercase tracking-widest">Sevii Colecionáveis</Link>
          <Link to="/orders/$orderId" params={{ orderId }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Voltar ao pedido
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Concluir pagamento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pedido <span className="font-mono">#{order.id.slice(0, 8).toUpperCase()}</span> · Total <span className="font-semibold text-foreground">R$ {total}</span>
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-2">Forma de pagamento</p>
          <div className="space-y-2">
            <label className="flex items-start gap-3 rounded-lg border border-border p-4 cursor-pointer hover:bg-secondary/50">
              <input type="radio" name="pm" checked={method === "pix"} onChange={() => setMethod("pix")} className="mt-1" />
              <div className="flex-1">
                <p className="text-sm font-semibold flex items-center gap-2"><QrCode className="h-4 w-4" /> Pix</p>
                <p className="text-xs text-muted-foreground">Aprovação instantânea — QR Code e copia e cola.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-border p-4 cursor-pointer hover:bg-secondary/50">
              <input type="radio" name="pm" checked={method === "card"} onChange={() => setMethod("card")} className="mt-1" />
              <div className="flex-1">
                <p className="text-sm font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Cartão de crédito</p>
                <p className="text-xs text-muted-foreground">Até 12x via Mercado Pago.</p>
              </div>
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            {method === "pix" ? (
              <Button
                onClick={startPix}
                disabled={busy}
                className="rounded-md bg-foreground text-background px-5 py-2.5 text-sm font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50"
              >
                {pix ? "Gerar novo Pix" : busy ? "Gerando..." : "Gerar Pix"}
              </Button>
            ) : (
              <Button
                onClick={startCard}
                disabled={!user}
                className="rounded-md bg-foreground text-background px-5 py-2.5 text-sm font-bold uppercase tracking-wider hover:opacity-90"
              >
                {showCard ? "Reiniciar formulário" : "Pagar com cartão"}
              </Button>
            )}
          </div>
          {err && <div className="mt-3 space-y-2"><p className="text-xs text-destructive">{err}</p><Link to={user ? "/conta" : "/auth"} search={user ? {} : { redirect: `/pay/${orderId}` }} className="text-sm underline">{user ? "Corrigir meu cadastro" : "Entrar para completar o cadastro"}</Link></div>}
          {!user && method === "card" && <Link to="/auth" search={{ redirect: `/pay/${orderId}` }} className="mt-3 block text-sm underline">Entrar na conta para pagar com cartão</Link>}
        </div>

        {method === "pix" && pix && <PixDisplay key={pix.expiresAt} pix={pix} session={session} paymentToken={paymentToken} onPaid={() => { if (user) nav({ to: "/orders/$orderId", params: { orderId } }); else setOrder((current: any) => ({ ...current, status: "paid" })); }} />}

        {method === "card" && showCard && (
          <CardBrick
            orderId={orderId}
            totalCents={order.total_cents}
            onPaid={() => nav({ to: "/orders/$orderId", params: { orderId } })}
          />
        )}
      </main>
    </div>
  );
}

function PixDisplay({ pix, session, paymentToken, onPaid }: { pix: PixState; session: any; paymentToken: string | null; onPaid: () => void }) {
  const checkLinked = useServerFn(checkLinkedAuctionPayment);
  const checkAuthenticated = useServerFn(checkPixOrderStatus);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.floor((new Date(pix.expiresAt).getTime() - Date.now()) / 1000)));
  const [status, setStatus] = useState<"pending" | "paid" | "cancelled">("pending");
  const polling = useRef(true);

  useEffect(() => {
    polling.current = true;
    const tick = async () => {
      if (!polling.current || (!paymentToken && !session?.access_token)) return;
      try {
        const r = paymentToken
          ? await checkLinked({ data: { orderId: pix.orderId, token: paymentToken } })
          : await checkAuthenticated({ data: { orderId: pix.orderId } });
        if (r.status === "paid") {
          polling.current = false;
          setStatus("paid");
          setTimeout(onPaid, 1500);
        }
      } catch (e) {
        console.error(e);
      }
    };
    tick();
    const i = setInterval(tick, 5000);
    return () => { polling.current = false; clearInterval(i); };
  }, [pix.orderId, session, paymentToken, onPaid, checkLinked, checkAuthenticated]);

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const copy = async () => {
    const ok = await copyToClipboard(pix.qrCode);
    if (ok) {
      setCopied(true);
      toast.success("Código Pix copiado!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Não foi possível copiar automaticamente. Toque e segure no código para copiar manualmente.");
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="space-y-4">
      {status === "paid" && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
          <p className="text-sm font-semibold text-green-800">✓ Pagamento confirmado! Redirecionando...</p>
        </div>
      )}
      <div className="rounded-xl border border-border p-6 bg-card flex flex-col items-center">
        <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code Pix" className="h-64 w-64 rounded-lg bg-white p-2" />
        <p className="mt-3 text-xs text-muted-foreground">Expira em <span className="font-mono font-semibold text-foreground">{mm}:{ss}</span></p>
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide mb-2">Pix Copia e Cola</label>
        <div className="flex gap-2">
          <textarea readOnly value={pix.qrCode} rows={3} className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-none" />
          <button onClick={copy} className="shrink-0 rounded-md bg-foreground text-background px-4 text-xs font-semibold hover:opacity-90 flex items-center gap-1">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    MercadoPago?: any;
  }
}

let mpSdkPromise: Promise<void> | null = null;
function loadMpSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.MercadoPago) return Promise.resolve();
  if (mpSdkPromise) return mpSdkPromise;
  mpSdkPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sdk.mercadopago.com/js/v2";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { mpSdkPromise = null; reject(new Error("Falha ao carregar SDK do Mercado Pago")); };
    document.head.appendChild(s);
  });
  return mpSdkPromise;
}

function CardBrick({ orderId, totalCents, onPaid }: { orderId: string; totalCents: number; onPaid: () => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "in_process" | "approved" | "rejected">("idle");
  const [saveCard, setSaveCard] = useState(false);
  const saveCardRef = useRef(false);
  const controllerRef = useRef<any>(null);
  const containerId = "mp-card-brick-resume";

  useEffect(() => {
    saveCardRef.current = saveCard;
  }, [saveCard]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ publicKey }, customerInfo] = await Promise.all([
          getMercadoPagoPublicKey({}),
          getMpCustomerForCheckout({}).catch(() => ({ customerId: null as string | null })),
        ]);
        if (cancelled) return;
        await loadMpSdk();
        if (cancelled) return;
        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        const bricksBuilder = mp.bricks();
        const payerInit: Record<string, unknown> = { email: user?.email ?? "" };
        if (customerInfo.customerId) payerInit.customerId = customerInfo.customerId;
        const settings = {
          initialization: {
            amount: totalCents / 100,
            payer: payerInit,
          },
          customization: {
            paymentMethods: { maxInstallments: 12 },
            visual: { style: { theme: "default" } },
          },
          callbacks: {
            onReady: () => { if (!cancelled) setLoading(false); },
            onError: (e: any) => { console.error(e); if (!cancelled) setErr(e?.message ?? "Erro no formulário"); },
            onSubmit: async (formData: any) => {
              setSubmitting(true);
              setErr(null);
              try {
                const result = await payExistingOrderWithCard({
                  data: {
                    orderId,
                    card: {
                      token: formData.token,
                      paymentMethodId: formData.payment_method_id,
                      issuerId: formData.issuer_id ? String(formData.issuer_id) : null,
                      installments: Number(formData.installments) || 1,
                      payerEmail: formData.payer?.email ?? user?.email ?? null,
                      payerCpf: formData.payer?.identification?.number ?? null,
                    },
                    saveCard: saveCardRef.current,
                  },
                });
                if (result.status === "approved") {
                  setStatus("approved");
                  toast.success("Pagamento aprovado!");
                  setTimeout(onPaid, 1200);
                } else if (result.status === "in_process") {
                  setStatus("in_process");
                  setTimeout(onPaid, 1500);
                } else {
                  setStatus("rejected");
                  setErr(result.statusDetail ?? "Pagamento recusado pelo emissor.");
                }
              } catch (e: any) {
                setErr(e?.message ?? "Erro ao processar pagamento");
              } finally {
                setSubmitting(false);
              }
            },
          },
        };
        const controller = await bricksBuilder.create("cardPayment", containerId, settings);
        if (cancelled) { controller?.unmount?.(); return; }
        controllerRef.current = controller;
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Erro ao iniciar pagamento");
      }
    })();
    return () => {
      cancelled = true;
      controllerRef.current?.unmount?.();
      controllerRef.current = null;
    };
  }, [orderId, totalCents, user]);

  return (
    <div className="space-y-3">
      {status === "approved" && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center text-sm font-semibold text-green-800">
          ✓ Pagamento aprovado! Redirecionando...
        </div>
      )}
      {status === "in_process" && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-center text-sm text-yellow-800">
          Pagamento em análise. Você será notificado quando aprovado.
        </div>
      )}
      {loading && <p className="text-xs text-muted-foreground">Carregando formulário de cartão...</p>}
      <div id={containerId} />
      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={saveCard}
          onChange={(e) => setSaveCard(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Salvar este cartão para pagamentos futuros. O número fica armazenado de forma segura no Mercado Pago
          (PCI-DSS); guardamos apenas os 4 últimos dígitos e a bandeira. Você pode remover a qualquer momento em
          "Minha conta".
        </span>
      </label>
      {submitting && <p className="text-xs text-muted-foreground">Processando pagamento...</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
