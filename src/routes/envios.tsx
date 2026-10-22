import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, Clock, Bike, CalendarCheck, AlertTriangle } from "lucide-react";
import logoUrl from "@/assets/logo.webp";

const WHATSAPP_URL = "https://wa.me/557998150955";
const WHATSAPP_DISPLAY = "(79) 9 9815-0955";
const BRAND = "#20a5c9";
const BRAND_HOVER = "#1b8eae";

export const Route = createFileRoute("/envios")({
  head: () => ({
    meta: [
      { title: "Política de Envios e Retirada (Apenas Aracaju) — Sevii Colecionáveis" },
      {
        name: "description",
        content:
          "Como funciona a retirada e o envio dos pedidos da Sevii Colecionáveis em Aracaju: pontos de retirada, prazos, envio por aplicativo e presença em eventos.",
      },
      { property: "og:title", content: "Política de Envios e Retirada — Sevii Colecionáveis" },
      {
        property: "og:description",
          content:
            "Retirada em Aruana e Aeroporto, envio por Uber Entrega e entregador parceiro da loja e presença em eventos. Atendimento via WhatsApp.",
      },
    ],
  }),
  component: EnviosPage,
});

type CardProps = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  children: React.ReactNode;
  cta?: { label: string; href: string };
};

function PolicyCard({ icon: Icon, title, children, cta }: CardProps) {
  return (
    <article className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8">
      <div
        className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200"
        style={{ color: BRAND }}
      >
        <Icon className="h-6 w-6" strokeWidth={2} />
      </div>
      <h2 className="text-lg sm:text-xl font-semibold text-neutral-900">{title}</h2>
      <div className="mt-3 flex-1 text-sm leading-relaxed text-neutral-600">{children}</div>
      {cta && (
        <div className="mt-6">
          <a
            href={cta.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: BRAND }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND)}
          >
            {cta.label}
          </a>
        </div>
      )}
    </article>
  );
}

function EnviosPage() {
  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={logoUrl} alt="Sevii Colecionáveis" className="h-12 w-auto sm:h-14" />
          </Link>
          <Link to="/" className="text-xs font-semibold uppercase tracking-widest hover:underline">
            ← Catálogo
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">
            Aracaju — SE
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-neutral-900">
            Política de Envios e Retirada
          </h1>
          <p className="mt-3 text-sm sm:text-base text-neutral-600">
            Atendimento exclusivo para a região de Aracaju. Confira abaixo as opções
            disponíveis para retirar ou receber seu pedido.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
          <PolicyCard
            icon={MapPin}
            title="Retirada no endereço"
            cta={{ label: "Falar pelo WhatsApp", href: WHATSAPP_URL }}
          >
            <p>Realizamos retirada em dois pontos:</p>
            <ul className="mt-3 space-y-2">
              <li>
                <span className="font-medium text-neutral-800">Condomínio Vista de Aruana:</span>{" "}
                R. Josepha Andrade Irmã Fontes, 600 — Aruana, Aracaju - SE
              </li>
              <li>
                <span className="font-medium text-neutral-800">Condomínio Palm Ville:</span>{" "}
                Av. Silvério Leite Fontes, 1128 — Aeroporto, Aracaju - SE
              </li>
            </ul>
            <p className="mt-3">
              Retiradas em dias úteis, em horário comercial. Para outros dias ou horários,
              consulte a disponibilidade pelo WhatsApp antes de se deslocar.
            </p>
          </PolicyCard>

          <PolicyCard icon={Clock} title="Prazo para retirada">
            <p>
              Após a confirmação do pedido, você tem até{" "}
              <span className="font-medium text-neutral-800">15 dias</span> para realizar a
              retirada.
            </p>
            <div className="mt-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" strokeWidth={2} />
              <p className="text-sm text-amber-900">
                Pedidos não retirados dentro do prazo serão cancelados com estorno de{" "}
                <span className="font-semibold">80% do valor pago</span>.
              </p>
            </div>
          </PolicyCard>

          <PolicyCard
            icon={Bike}
            title="Envio por aplicativo"
            cta={{ label: "Falar pelo WhatsApp", href: WHATSAPP_URL }}
          >
            <p>
              Trabalhamos com <span className="font-medium text-neutral-800">Uber Entrega</span> e{" "}
              <span className="font-medium text-neutral-800">Entregador parceiro da loja</span>. O valor do
              frete varia conforme a sua localização e é calculado no momento do envio.
            </p>
            <p className="mt-3">
              Após a confirmação do pedido, combinamos os detalhes pelo WhatsApp.
            </p>
          </PolicyCard>

          <PolicyCard
            icon={CalendarCheck}
            title="Retirada em eventos"
            cta={{ label: "Verificar agenda", href: WHATSAPP_URL }}
          >
            <p>
              Estamos presentes em feiras, lojas e eventos relacionados à marca. Consulte nossa
              agenda pelo WhatsApp para saber quando e onde estaremos.
            </p>
            <p className="mt-3">
              No local, procure um dos nossos membros para realizar a retirada.
            </p>
          </PolicyCard>
        </div>

        <p className="mt-12 text-center text-sm text-neutral-500">
          Dúvidas? Fale com a gente pelo WhatsApp.{" "}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-4"
            style={{ color: BRAND }}
          >
            {WHATSAPP_DISPLAY}
          </a>
        </p>
      </main>
    </div>
  );
}
