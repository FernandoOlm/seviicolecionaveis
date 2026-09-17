import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import appCss from "../styles.css?url";
import pokeballPattern from "@/assets/pokeball-pattern.webp";
import { AuthProvider } from "@/hooks/useAuth";
import { CartProvider } from "@/hooks/useCart";
import { WishlistProvider } from "@/hooks/useWishlist";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { GlobalHeaderActions } from "@/components/GlobalHeaderActions";
import { CompareBar } from "@/components/CompareBar";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { SitePopups } from "@/components/SitePopups";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sevii Colecionáveis — Cartas Pokémon Colecionáveis" },
      { name: "description", content: "Loja de cartas Pokémon colecionáveis com catálogo completo, filtros por tipo, coleção, condição, idioma e preço, e estoque em tempo real." },
      { name: "author", content: "Sevii Colecionáveis" },
      { property: "og:site_name", content: "Sevii Colecionáveis" },
      { property: "og:title", content: "Sevii Colecionáveis — Cartas Pokémon Colecionáveis" },
      { property: "og:description", content: "Catálogo completo de cartas Pokémon com filtros avançados e estoque em tempo real." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://seviicolecionaveis.com.br/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Sevii Colecionáveis — Cartas Pokémon Colecionáveis" },
      { name: "twitter:description", content: "Catálogo completo de cartas Pokémon com filtros avançados e estoque em tempo real." },
      { name: "theme-color", content: "#0f172a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Sevii" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
    ],
    scripts: [
      { src: "https://www.googletagmanager.com/gtag/js?id=G-2Y61Z4FGFL", async: true },
      {
        children: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', 'G-2Y61Z4FGFL', { send_page_view: false });`,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Sevii Colecionáveis",
          url: "https://seviicolecionaveis.com.br/",
          logo: "https://seviicolecionaveis.com.br/icon-512.png",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Sevii Colecionáveis",
          url: "https://seviicolecionaveis.com.br/",
          inLanguage: "pt-BR",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

if (typeof window !== "undefined") {
  // Auto-recover from stale chunk imports after a deploy.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    if (!sessionStorage.getItem("__chunk_reload__")) {
      sessionStorage.setItem("__chunk_reload__", "1");
      window.location.reload();
    }
  });
  window.addEventListener("load", () => {
    sessionStorage.removeItem("__chunk_reload__");
  });
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <WishlistProvider>
        <CartProvider>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 -z-10 bg-background"
            style={{
              backgroundImage: `url(${pokeballPattern})`,
              backgroundRepeat: "repeat",
              backgroundSize: "180px 180px",
              opacity: 0.08,
            }}
          />
          
          <AnalyticsTracker />
            <Outlet />
            <GlobalHeaderActions />
            {/* Pop-up da comunidade agora é gerenciado em Admin → Pop-ups */}
            <WhatsAppButton />
            <CompareBar />
            <PwaInstallBanner />
            <SitePopups />
        </CartProvider>
      </WishlistProvider>
    </AuthProvider>
    </QueryClientProvider>
  );
}
