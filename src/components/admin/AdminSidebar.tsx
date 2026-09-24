import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  BadgePercent,
  Bell,
  Bot,
  Camera,
  Boxes,

  CalendarClock,
  CreditCard,
  Gamepad2,
  Gavel,
  Gauge,
  Gift,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Mail,
  Menu,
  Package,
  Plug,
  ShoppingBag,
  Sparkles,
  Terminal,
  Ticket,
  Timer,
  Truck,
  Users,
  X,
  Zap,
} from "lucide-react";

type NavLink = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean };
type NavGroup = { label: string; links: NavLink[] };

export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Visão geral",
    links: [
      { to: "/admin", label: "Pedidos", icon: ShoppingBag, exact: true },
      { to: "/admin/dashboard", label: "Dashboard", icon: Gauge },
    ],
  },
  {
    label: "Catálogo",
    links: [
      { to: "/admin/manage-cards", label: "Gerenciar cartas", icon: Layers },
      { to: "/admin/reconhecer-cartas", label: "Reconhecer por foto", icon: Camera },
      { to: "/admin/panels", label: "Painéis", icon: LayoutGrid },
      { to: "/admin/sealed", label: "Produtos Lacrados", icon: Package },
      { to: "/admin/accessories", label: "Acessórios", icon: Boxes },
      { to: "/admin/videogames", label: "Videogames", icon: Gamepad2 },
    ],
  },
  {
    label: "Operações",
    links: [
      { to: "/admin/shipping", label: "Expedição", icon: Truck },
      { to: "/admin/pilha", label: "Pilha de Cartas", icon: Layers },
      { to: "/admin/leiloes", label: "Leilões (Pilha)", icon: Gift },
      { to: "/admin/leiloes-whatsapp", label: "Leilões WhatsApp", icon: Gavel },
      { to: "/admin/evento", label: "Modo Evento", icon: CalendarClock },
      { to: "/admin/sorteios", label: "Sorteios", icon: Ticket },
    ],
  },
  {
    label: "Marketing",
    links: [
      { to: "/admin/banners", label: "Banners", icon: ImageIcon },
      { to: "/admin/coupons", label: "Cupons", icon: BadgePercent },
      { to: "/admin/emails", label: "E-mails", icon: Mail },
      { to: "/admin/loyalty", label: "Pontos / Fidelidade", icon: Sparkles },
      { to: "/admin/ofertas-relampago", label: "Ofertas Relâmpago", icon: Zap },
      { to: "/admin/popups", label: "Pop-ups", icon: Bell },
      { to: "/admin/pre-venda", label: "Pré-Venda", icon: Timer },
    ],
  },
  {
    label: "Sistema",
    links: [
      { to: "/admin/conectar-bot", label: "Conectar Bot", icon: Bot },
      { to: "/admin/comandos", label: "Comandos & Enquetes", icon: Terminal },
      { to: "/admin/integrations", label: "Integrações", icon: Plug },
      { to: "/admin/users", label: "Administradores", icon: Users },
    ],
  },
];


function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5 p-3">
      <Link to="/admin" onClick={onNavigate} className="px-2 py-1 text-xs font-bold uppercase tracking-widest">
        Sevii · Admin
      </Link>
      {ADMIN_NAV.map((group) => (
        <div key={group.label}>
          <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.links.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={onNavigate}
                  activeOptions={{ exact: l.exact }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary"
                  activeProps={{
                    className:
                      "!bg-admin-active !text-admin-active-foreground hover:!bg-admin-active [&>svg]:!text-admin-active-foreground",
                  }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <Link
        to="/"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      >
        <CreditCard className="h-3.5 w-3.5" /> ← Voltar ao catálogo
      </Link>
    </nav>
  );
}

export function AdminSidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="no-print hidden lg:block w-60 shrink-0 border-r border-border bg-card">
        <div className="sticky top-0 max-h-screen overflow-y-auto">
          <NavContent />
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print lg:hidden fixed bottom-4 left-4 z-50 rounded-full border border-border bg-card p-3 shadow-lg"
        aria-label="Abrir menu do admin"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="no-print lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 max-w-[80vw] overflow-y-auto bg-card border-r border-border">
            <div className="flex justify-end p-2">
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavContent onNavigate={() => setOpen(false)} />
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
