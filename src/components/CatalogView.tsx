import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { type Card } from "@/data/cards";
import { useCardsCatalog, cardCreatedAt } from "@/hooks/useCardsCatalog";
import { useCardStats } from "@/hooks/useCardStats";
import { CardItem } from "@/components/catalog/CardItem";
import { CardModal } from "@/components/catalog/CardModal";
import { Filters, type FilterState, type IllustratorOption } from "@/components/catalog/Filters";
import { useIllustrators } from "@/lib/illustrators";
import { HeaderActions } from "@/components/HeaderActions";
import { CartDrawer } from "@/components/CartDrawer";
import { BannerCarousel } from "@/components/BannerCarousel";
import { TrustBadges } from "@/components/TrustBadges";
import { SiteFooter } from "@/components/SiteFooter";
import { RecentlyViewed } from "@/components/catalog/RecentlyViewed";
import { NewArrivals } from "@/components/catalog/NewArrivals";
import { SiteNav } from "@/components/SiteNav";
import logoUrl from "@/assets/logo.webp";

const DEFAULT_FILTERS: FilterState = {
  categories: [],
  trainerSubcategories: [],
  pokemonTypes: [],
  finishes: [],
  collection: "",
  languages: [],
  conditions: [],
  inStockOnly: false,
  priceMin: "",
  priceMax: "",
  numberQuery: "",
  illustratorIds: [],
};

type Sort = "relevance" | "price-asc" | "price-desc" | "name" | "number-asc" | "number-desc" | "newest" | "oldest";

const cardNumValue = (n: string) => {
  const m = n.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
};

const BATCH_SIZE = 50;

interface Props {
  heading?: string;
  showBanners?: boolean;
}

export function CatalogView({ heading = "Catálogo de Cartas Pokémon — Sevii Colecionáveis", showBanners = true }: Props) {
  const { cards: CARDS, loading: cardsLoading } = useCardsCatalog();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("relevance");
  const [active, setActive] = useState<Card | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [cartOpen, setCartOpen] = useState(false);
  const stats = useCardStats();
  const { illustrators } = useIllustrators();

  const illustratorOptions: IllustratorOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of CARDS) {
      if (c.illustratorId) counts.set(c.illustratorId, (counts.get(c.illustratorId) ?? 0) + 1);
    }
    return illustrators
      .map((i) => ({ id: i.id, name: i.name, count: counts.get(i.id) ?? 0 }))
      .filter((o) => o.count > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [illustrators, CARDS]);

  const shuffleSeed = useMemo(() => Math.random(), []);
  const filtered = useMemo(() => {
    const hasMin = filters.priceMin !== "";
    const hasMax = filters.priceMax !== "";
    const min = hasMin ? Number(filters.priceMin) : -Infinity;
    const max = hasMax ? Number(filters.priceMax) : Infinity;
    const priceFilterActive = hasMin || hasMax;
    const q = query.trim().toLowerCase();
    const numQ = filters.numberQuery.trim().toLowerCase();

    const list = CARDS.filter((c) => {
      if (filters.categories.length && !filters.categories.includes(c.category)) return false;
      if (filters.trainerSubcategories.length && (c.category !== "Treinador" || !c.trainerSubcategory || !filters.trainerSubcategories.includes(c.trainerSubcategory))) return false;
      if (filters.pokemonTypes.length && (!c.pokemonType || !filters.pokemonTypes.includes(c.pokemonType))) return false;
      if (filters.illustratorIds.length && (!c.illustratorId || !filters.illustratorIds.includes(c.illustratorId))) return false;
      if (filters.finishes.length && !c.variants.some((v) => filters.finishes.includes(v.finish))) return false;
      if (filters.collection && c.collection !== filters.collection) return false;
      if (filters.languages.length && !c.languages.some((l) => filters.languages.includes(l.language))) return false;
      if (filters.conditions.length && !c.variants.some((v) => filters.conditions.includes(v.condition))) return false;
      if (filters.inStockOnly && c.stock === 0) return false;
      if (priceFilterActive) {
        if (c.price == null) return false;
        if (c.price < min || c.price > max) return false;
      }
      if (numQ && !c.number.toLowerCase().includes(numQ)) return false;
      if (q) {
        const hay = `${c.name} ${c.collection} ${c.number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const realVariants = (c: typeof list[number]) =>
      c.variants.filter((v) => v.finish !== "Ímã" && v.price != null);
    const minRealPrice = (c: typeof list[number]) => {
      const prices = realVariants(c).map((v) => v.price!);
      return prices.length ? Math.min(...prices) : null;
    };
    const maxRealPrice = (c: typeof list[number]) => {
      const prices = realVariants(c).map((v) => v.price!);
      return prices.length ? Math.max(...prices) : null;
    };
    switch (sort) {
      case "price-asc":
        return [...list].sort((a, b) => {
          const pa = minRealPrice(a);
          const pb = minRealPrice(b);
          if (pa == null && pb == null) return 0;
          if (pa == null) return 1;
          if (pb == null) return -1;
          return pa - pb;
        });
      case "price-desc":
        return [...list].sort((a, b) => {
          const pa = maxRealPrice(a);
          const pb = maxRealPrice(b);
          if (pa == null && pb == null) return 0;
          if (pa == null) return 1;
          if (pb == null) return -1;
          return pb - pa;
        });
      case "name":
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case "number-asc":
        return [...list].sort((a, b) => cardNumValue(a.number) - cardNumValue(b.number) || a.number.localeCompare(b.number));
      case "number-desc":
        return [...list].sort((a, b) => cardNumValue(b.number) - cardNumValue(a.number) || b.number.localeCompare(a.number));
      case "newest":
        return [...list].sort((a, b) => {
          const ca = cardCreatedAt.get(`${a.name}__${a.collection}__${a.number}`) ?? "";
          const cb = cardCreatedAt.get(`${b.name}__${b.collection}__${b.number}`) ?? "";
          return cb.localeCompare(ca);
        });
      case "oldest":
        return [...list].sort((a, b) => {
          const ca = cardCreatedAt.get(`${a.name}__${a.collection}__${a.number}`) ?? "";
          const cb = cardCreatedAt.get(`${b.name}__${b.collection}__${b.number}`) ?? "";
          return ca.localeCompare(cb);
        });
      default: {
        const maxViews = Math.max(1, ...Array.from(stats.views.values()));
        const maxSales = Math.max(1, ...Array.from(stats.sales.values()));
        const scored = list.map((c, i) => {
          const v = (stats.views.get(c.id) ?? 0) / maxViews;
          const s = (stats.sales.get(c.id) ?? 0) / maxSales;
          const h = Math.sin((i + 1) * 9999 * shuffleSeed) * 10000;
          const rand = h - Math.floor(h);
          const score = s * 0.4 + v * 0.3 + rand * 0.3 - (c.stock === 0 ? 0.5 : 0);
          return { c, score };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored.map((x) => x.c);
      }
    }
  }, [filters, query, sort, CARDS, shuffleSeed, stats]);

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
  };

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [filters, query, sort]);


  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 pr-40 sm:px-6 sm:pr-36 md:pr-32 lg:pr-6">
          <Link
            to="/"
            className="flex items-center gap-3"
            onClick={() => {
              reset();
              if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <img
              src={logoUrl}
              alt="Sevii Colecionáveis"
              fetchPriority="high"
              width={224}
              height={56}
              className="h-12 w-auto sm:h-14"
            />
            <span className="sr-only">Sevii Colecionáveis</span>
          </Link>

          <SiteNav className="hidden min-w-0 md:flex" />

          <div className="flex items-center gap-1">
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex lg:hidden items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-medium ml-1"
            >
              <SlidersHorizontal className="h-4 w-4" /> Filtros
            </button>
          </div>
        </div>

        <div className="border-t border-border px-4 py-3 space-y-3 sm:px-6">
          <SiteNav className="md:hidden -mx-1 overflow-x-auto" />
          <div className="relative mx-auto w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="catalog-search" className="sr-only">Buscar cartas</label>
            <input
              id="catalog-search"
              type="search"
              aria-label="Buscar cartas no catálogo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, coleção, numeração..."
              className="h-10 w-full min-w-0 rounded-full bg-secondary pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-gold"
            />
          </div>
        </div>

      </header>

      {showBanners && query.trim() === "" && <BannerCarousel />}
      <TrustBadges />
      {showBanners && query.trim() === "" && <NewArrivals />}

      <h1 className="sr-only">{heading}</h1>

      <main className="mx-auto max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:flex">
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
            <Filters filters={filters} onChange={setFilters} onReset={reset} illustratorOptions={illustratorOptions} />
          </div>
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-foreground/40" onClick={() => setDrawerOpen(false)} />
            <div className="absolute right-0 top-0 h-full w-[85%] max-w-sm overflow-y-auto bg-background p-6 shadow-xl">
              <div className="mb-6 flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-widest">Filtros</h3>
                <button onClick={() => setDrawerOpen(false)} className="rounded-full p-1 hover:bg-secondary" aria-label="Fechar">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <Filters filters={filters} onChange={setFilters} onReset={reset} illustratorOptions={illustratorOptions} />
            </div>
          </div>
        )}

        <section className="flex-1 min-w-0">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "carta encontrada" : "cartas encontradas"}
            </p>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.inStockOnly}
                  onChange={(e) => setFilters({ ...filters, inStockOnly: e.target.checked })}
                  className="rounded border-border accent-foreground"
                />
                Apenas em estoque
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium focus:outline-none"
              >
                <option value="relevance">Relevância</option>
                <option value="price-desc">Preço: Maior → Menor</option>
                <option value="price-asc">Preço: Menor → Maior</option>
                <option value="name">Nome (A-Z)</option>
                <option value="number-asc">Numeração do Card [0-9]</option>
                <option value="number-desc">Numeração do Card [9-0]</option>
                <option value="newest">Adicionadas Recentemente</option>
                <option value="oldest">Adicionadas Antigamente</option>
              </select>
            </div>
          </div>

          {cardsLoading && filtered.length === 0 ? (
            <div className="grid place-items-center py-16 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
                Carregando catálogo...
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <p className="text-sm text-muted-foreground">Nenhuma carta encontrada com os filtros atuais.</p>
              <button onClick={reset} className="mt-4 text-sm font-medium underline underline-offset-2">
                Limpar filtros
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.slice(0, visibleCount).map((card) => (
                  <CardItem key={card.id} card={card} onClick={() => setActive(card)} />
                ))}
              </div>
              {visibleCount < filtered.length && (
                <div className="mt-12 flex flex-col items-center gap-3">
                  <p className="text-xs text-muted-foreground">
                    Exibindo {Math.min(visibleCount, filtered.length)} de {filtered.length} cartas
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      const y = typeof window !== "undefined" ? window.scrollY : 0;
                      setVisibleCount((v) => v + BATCH_SIZE);
                      if (typeof window !== "undefined") {
                        requestAnimationFrame(() => window.scrollTo({ top: y }));
                      }
                    }}
                    className="rounded-full px-6 py-2.5 text-sm font-medium text-white transition-colors"
                    style={{ backgroundColor: "#20a5c9" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1b8eae")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#20a5c9")}
                  >
                    Ver mais cartas
                  </button>
                </div>
              )}
              {visibleCount >= filtered.length && filtered.length > BATCH_SIZE && (
                <p className="mt-12 text-center text-xs text-muted-foreground">
                  Você viu todas as {filtered.length} cartas.
                </p>
              )}
            </>
          )}
        </section>
      </main>

      <CardModal card={active} onClose={() => setActive(null)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />

      <RecentlyViewed />
      <SiteFooter />
    </div>
  );
}
