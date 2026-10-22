import { createFileRoute, notFound, Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowLeft, ZoomIn, X, MessageCircle } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { getActivePresalePageBySlug, type PublicPresalePage, type PublicPresaleProduct } from "@/lib/presale.functions";
import logoUrl from "@/assets/logo.webp";

const WHATSAPP_NUMBER = "5579981509552";

export const Route = createFileRoute("/pre-venda/$slug")({
  loader: async ({ params }): Promise<{ page: PublicPresalePage }> => {
    const result = await getActivePresalePageBySlug({ data: { slug: params.slug } }) as {
      page: PublicPresalePage | null;
      error: boolean;
    };
    const { page, error } = result;
    if (error) throw new Error("Não foi possível carregar esta pré-venda agora. Tente novamente.");
    if (!page) throw notFound();
    return { page };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Pré-Venda não encontrada" }, { name: "robots", content: "noindex" }] };
    }
    const title = `${loaderData.page.title} — Pré-Venda | Sevii Colecionáveis`;
    const desc = `Reserve agora: ${loaderData.page.title}. Pré-venda oficial na Sevii Colecionáveis.`;
    const coverFromArray = loaderData.page.products.find((p) => p.image_urls && p.image_urls.length)?.image_urls?.[0];
    const img = coverFromArray ?? loaderData.page.products.find((p) => p.image_url)?.image_url ?? undefined;
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: img ? "summary_large_image" : "summary" },
    ];
    if (img && img.startsWith("https://")) {
      meta.push({ property: "og:image", content: img });
      meta.push({ name: "twitter:image", content: img });
    }
    return { meta };
  },
  component: PresalePage,
  notFoundComponent: PresaleNotFound,
  errorComponent: PresaleLoadError,
});

function PresaleLoadError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : "Tente novamente em instantes.";
  return (
    <Shell>
      <main className="grid min-h-[50vh] place-items-center px-4">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">Não foi possível carregar</h1>
          <p role="alert" className="text-muted-foreground">
            {message}
          </p>
          <button
            type="button"
            onClick={() => router.invalidate()}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-foreground/40 transition"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={logoUrl} alt="Sevii Colecionáveis" width={224} height={56} className="h-12 w-auto sm:h-14" />
          </Link>
          <SiteNav className="hidden md:flex" />
        </div>
        <div className="md:hidden border-t border-border px-4 py-3">
          <SiteNav className="-mx-1 overflow-x-auto" />
        </div>
      </header>
      {children}
      <SiteFooter />
    </div>
  );
}

function PresaleNotFound() {
  return (
    <Shell>
      <main className="grid min-h-[50vh] place-items-center px-4">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">Pré-venda indisponível</h1>
          <p className="text-muted-foreground">Esta pré-venda não está mais ativa.</p>
          <Link to="/pre-venda" className="text-sm underline">Ver pré-vendas ativas</Link>
        </div>
      </main>
    </Shell>
  );
}

function formatBRL(cents: number) {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

function PresalePage() {
  const { page } = Route.useLoaderData();
  return (
    <Shell>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-10 pb-28 md:pb-8">
        {page.products.map((p: PublicPresaleProduct) => (
          <PresaleProductBlock key={p.id} product={p} pageTitle={page.title} />
        ))}
        {page.products.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum produto disponível nesta pré-venda.</p>
        )}
      </main>
    </Shell>
  );
}

function PaymentOptionsBlock({ product }: { product: PublicPresaleProduct }) {
  const opts = Array.isArray(product.payment_options) ? product.payment_options : [];
  const pix = opts.find((o) => o.metodo === "pix") as { metodo: "pix"; valor_cents: number } | undefined;
  const vista = opts.find((o) => o.metodo === "cartao_vista") as { metodo: "cartao_vista"; valor_cents: number } | undefined;
  const credito = opts.find((o) => o.metodo === "cartao_credito") as { metodo: "cartao_credito"; valor_total_cents: number; parcelas: number } | undefined;
  const pixValue = pix?.valor_cents ?? product.price_cents;
  const hasExtra = !!vista || !!credito;

  return (
    <div className="mt-5 space-y-2">
      <div>
        <div className="text-3xl font-bold">{formatBRL(pixValue)}</div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">no Pix</div>
      </div>
      {hasExtra && (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-background/60">
          {vista && (
            <li className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Cartão à vista</span>
              <span className="font-semibold">{formatBRL(vista.valor_cents)}</span>
            </li>
          )}
          {credito && (
            <li className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Cartão no crédito</span>
              <span className="text-right">
                <span className="font-semibold">
                  em até {credito.parcelas}x de {formatBRL(Math.round(credito.valor_total_cents / Math.max(1, credito.parcelas)))}
                </span>
                <span className="block text-xs text-muted-foreground">total {formatBRL(credito.valor_total_cents)}</span>
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function PresaleProductBlock({ product: p, pageTitle }: { product: PublicPresaleProduct; pageTitle: string }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => { setIdx(0); setZoomOpen(false); setZoomed(false); }, [p.id]);

  const imgs = (p.image_urls && p.image_urls.length ? p.image_urls : (p.image_url ? [p.image_url] : []));
  const dateLabel = formatDate(p.available_from);
  const msg = p.whatsapp_message_template.replaceAll("[nome do produto]", p.name);
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

  return (
    <section>
      <nav aria-label="breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/pre-venda" className="hover:text-foreground">{pageTitle}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground line-clamp-1">{p.name}</span>
      </nav>

      <button
        type="button"
        onClick={() => router.history.back()}
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para Pré-Vendas
      </button>

      <div className="rounded-2xl bg-card/95 backdrop-blur-sm shadow-sm ring-1 ring-border p-5 sm:p-8">
        <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start">
          <div>
            <button
              type="button"
              onClick={() => imgs.length > 0 && setZoomOpen(true)}
              className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-secondary md:max-h-[480px]"
              aria-label="Ampliar imagem"
            >
              {imgs[idx] ? (
                <img src={imgs[idx]} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">Sem imagem</div>
              )}
              {imgs.length > 0 && (
                <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-background/80 p-1.5 opacity-90 shadow group-hover:bg-background">
                  <ZoomIn className="h-4 w-4" />
                </span>
              )}
              {imgs.length > 1 && (
                <>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + imgs.length) % imgs.length); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setIdx((i) => (i - 1 + imgs.length) % imgs.length); } }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 hover:bg-background"
                    aria-label="Imagem anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % imgs.length); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setIdx((i) => (i + 1) % imgs.length); } }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 hover:bg-background"
                    aria-label="Próxima imagem"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </>
              )}
            </button>
            {imgs.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {imgs.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    onClick={() => setIdx(i)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${i === idx ? "border-primary" : "border-transparent opacity-70"}`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col md:sticky md:top-24 md:self-start">
            {(() => {
              const parts: string[] = [];
              if (p.language) parts.push(p.language);
              if (p.release_year) parts.push(String(p.release_year));
              if (dateLabel) parts.push(`Disponível em ${dateLabel}`);
              if (parts.length === 0) return null;
              return (
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground/80">
                  {parts.join(" · ")}
                </p>
              );
            })()}
            <h1 className="text-2xl font-bold sm:text-3xl">{p.name}</h1>
            {p.description && (
              <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line">{p.description}</p>
            )}


            <PaymentOptionsBlock product={p} />

            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 hidden md:inline-flex items-center justify-center gap-2 rounded-md bg-[#2563eb] px-5 py-3.5 text-base font-bold text-white shadow-sm hover:bg-[#1d4ed8] transition"
            >
              <MessageCircle className="h-5 w-5" />
              {p.whatsapp_button_text}
            </a>
          </div>
        </div>
      </div>

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Pré-venda</div>
          <div className="truncate text-lg font-bold">{formatBRL(p.price_cents)}</div>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-md bg-[#2563eb] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#1d4ed8] transition"
        >
          <MessageCircle className="h-4 w-4" />
          {p.whatsapp_button_text}
        </a>
      </div>


      {zoomOpen && imgs[idx] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-4"
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setZoomOpen(false); }}
            className="absolute right-4 top-4 z-10 rounded-full bg-background/90 p-2 hover:bg-background"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
          {imgs.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + imgs.length) % imgs.length); setZoomed(false); }}
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/90 p-2 hover:bg-background"
                aria-label="Imagem anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % imgs.length); setZoomed(false); }}
                className="absolute right-16 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/90 p-2 hover:bg-background"
                aria-label="Próxima imagem"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <img
              src={imgs[idx]}
              alt={p.name}
              onClick={() => setZoomed((z) => !z)}
              className={`select-none transition-transform duration-200 ${zoomed ? "scale-[2] cursor-zoom-out" : "cursor-zoom-in"} max-h-[90vh] max-w-[90vw] object-contain`}
            />
          </div>
        </div>
      )}
    </section>
  );
}
