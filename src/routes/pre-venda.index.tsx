import { createFileRoute, Link, redirect, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listActivePresalePages } from "@/lib/presale.functions";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/pre-venda/")({
  head: () => ({
    meta: [
      { title: "Pré-Venda — Sevii Colecionáveis" },
      { name: "description", content: "Reserve produtos em pré-venda na Sevii Colecionáveis." },
      { property: "og:title", content: "Pré-Venda — Sevii Colecionáveis" },
      { property: "og:description", content: "Reserve produtos em pré-venda na Sevii Colecionáveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => {
    const { pages, error } = await listActivePresalePages();
    if (error) throw new Error("Não foi possível carregar as pré-vendas agora. Tente novamente.");
    if (pages.length === 1) throw redirect({ to: "/pre-venda/$slug", params: { slug: pages[0].slug } });
    return { pages };
  },
  component: PresaleIndex,
  errorComponent: PresaleError,
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-muted-foreground">Nenhuma pré-venda no momento.</p>
      </main>
    </div>
  ),
});

function PresaleError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : "Não foi possível carregar as pré-vendas agora.";
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-bold mb-4">Pré-Vendas ativas</h1>
        <p role="alert" className="text-muted-foreground mb-4">
          {message}
        </p>
        <button
          type="button"
          onClick={() => router.invalidate()}
          className="rounded-lg border border-border px-4 py-2 font-medium hover:border-foreground/40 transition"
        >
          Tentar novamente
        </button>
      </main>
      <SiteFooter />
    </div>
  );
}

function PresaleIndex() {
  const { pages } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-bold mb-8">Pré-Vendas ativas</h1>
        {pages.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma pré-venda no momento.</p>
        ) : (
          <ul className="space-y-3">
            {pages.map((p: { id: string; slug: string; title: string }) => (
              <li key={p.id}>
                <Link
                  to="/pre-venda/$slug"
                  params={{ slug: p.slug }}
                  className="block rounded-xl border border-border bg-card p-5 hover:border-foreground/40 transition"
                >
                  <p className="text-lg font-semibold">{p.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
