import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PresaleNavButton } from "@/components/PresaleNavButton";

const CARTAS_GROUP = [
  { to: "/cartas", label: "Cartas" },
  { to: "/colecoes", label: "Coleções" },
  { to: "/mais-vendidas", label: "Mais vendidas" },
  { to: "/deck-builder", label: "Deck Builder" },
] as const;

const LINKS = [
  { to: "/imas", label: "Ímãs" },
  { to: "/acessorios", label: "Acessórios" },
  { to: "/produtos-lacrados", label: "Produtos Lacrados" },
  { to: "/videogames", label: "Videogames" },
  { to: "/sobre", label: "Sobre" },
  { to: "/favoritos", label: "Favoritos" },
] as const;

const FAQ_GROUP = [
  { to: "/faq", label: "Dúvidas (FAQ)" },
  { to: "/tipos-de-carta", label: "Tipos de Carta" },
  { to: "/envios", label: "Envios e Retirada" },
] as const;

export function SiteNav({ className = "" }: { className?: string }) {
  const [cartasOpen, setCartasOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const cartasActive = CARTAS_GROUP.some((l) => pathname === l.to);
  const faqActive = FAQ_GROUP.some((l) => pathname === l.to);

  return (
    <nav className={`items-center gap-1 ${className}`}>
      <PresaleNavButton className="mr-1" />
      <Popover open={cartasOpen} onOpenChange={setCartasOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
              cartasActive
                ? "!bg-admin-active !text-admin-active-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
            aria-haspopup="menu"
            aria-expanded={cartasOpen}
          >
            Cartas
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${cartasOpen ? "rotate-180" : ""}`} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-56 p-1">
          {CARTAS_GROUP.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setCartasOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-foreground transition hover:bg-secondary"
              activeProps={{ className: "bg-secondary font-semibold" }}
            >
              {l.label}
            </Link>
          ))}
        </PopoverContent>
      </Popover>

      {LINKS.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          activeProps={{ className: "!bg-admin-active !text-admin-active-foreground hover:!bg-admin-active hover:!text-admin-active-foreground" }}
        >
          {l.label}
        </Link>
      ))}

      <Popover open={faqOpen} onOpenChange={setFaqOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
              faqActive
                ? "!bg-admin-active !text-admin-active-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
            aria-haspopup="menu"
            aria-expanded={faqOpen}
          >
            Dúvidas (FAQ)
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${faqOpen ? "rotate-180" : ""}`} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-56 p-1">
          {FAQ_GROUP.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setFaqOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-foreground transition hover:bg-secondary"
              activeProps={{ className: "bg-secondary font-semibold" }}
            >
              {l.label}
            </Link>
          ))}
        </PopoverContent>
      </Popover>

      <Link
        to="/avisos"
        className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        activeProps={{ className: "!bg-admin-active !text-admin-active-foreground hover:!bg-admin-active hover:!text-admin-active-foreground" }}
      >
        Avisos
      </Link>

      <Link
        to="/comunidade"
        className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        activeProps={{ className: "!bg-admin-active !text-admin-active-foreground hover:!bg-admin-active hover:!text-admin-active-foreground" }}
      >
        Comunidade
      </Link>

      <Link
        to="/sorteios"
        className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        activeProps={{ className: "!bg-admin-active !text-admin-active-foreground hover:!bg-admin-active hover:!text-admin-active-foreground" }}
      >
        Sorteios
      </Link>
    </nav>
  );
}
