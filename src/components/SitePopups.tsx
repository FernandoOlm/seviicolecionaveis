import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PopupCard, type PopupCardData } from "@/components/PopupCard";
import { getPermanentlyDismissed, setPermanentlyDismissed } from "@/hooks/usePopupPreference";
import { supabase } from "@/integrations/supabase/client";

export type SitePopup = PopupCardData & { id: string };

const SESSION_PREFIX = "site-popup-session:";

export function SitePopups() {
  const [queue, setQueue] = useState<SitePopup[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [dsa, setDsa] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("site_popups")
        .select(
          "id, title, body_html, image_url, link_url, is_promo_code, promo_code, icon_key, button_enabled, button_label, button_action, button_target, button_bg_color, button_text_color, icon_bg_color, icon_color, promo_bg_color, promo_text_color, starts_at, ends_at, popup_key",
        )
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled) return;

      let list = ((data ?? []) as any[]).filter(
        (p) =>
          (!p.starts_at || p.starts_at <= nowIso) &&
          (!p.ends_at || p.ends_at >= nowIso) &&
          (p.popup_key === "event-mode" || !getPermanentlyDismissed(p.id)) &&
          !sessionStorage.getItem(SESSION_PREFIX + p.id),
      ) as SitePopup[];

      // Hide promo-code popups whose coupon the signed-in user has already used.
      const codes = list
        .filter((p) => p.is_promo_code && p.promo_code?.trim())
        .map((p) => p.promo_code!.trim().toUpperCase());
      if (codes.length > 0) {
        const { data: userData } = await supabase.auth.getUser();
        if (cancelled) return;
        if (userData?.user) {
          const { data: usedOrders } = await supabase
            .from("orders")
            .select("coupon_code")
            .eq("user_id", userData.user.id)
            .not("coupon_code", "is", null);
          if (cancelled) return;
          const used = new Set(
            (usedOrders ?? []).map((o) => (o.coupon_code ?? "").trim().toUpperCase()),
          );
          list = list.filter((p) => {
            const code = p.is_promo_code ? p.promo_code?.trim().toUpperCase() : null;
            if (!code || !used.has(code)) return true;
            setPermanentlyDismissed(p.id, true);
            return false;
          });
        }
      }

      if (list.length === 0) return;
      list.forEach((p) => sessionStorage.setItem(SESSION_PREFIX + p.id, "1"));
      setQueue(list);
      setTimeout(() => !cancelled && setOpen(true), 900);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      Object.entries(dsa).forEach(([id, v]) => v && setPermanentlyDismissed(id, true));
    }
  };

  if (queue.length === 0) return null;
  const current = queue[Math.min(index, queue.length - 1)]!;
  const multiple = queue.length > 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden sm:max-w-[440px] border-0 [&>button]:right-3 [&>button]:top-3 [&>button]:z-10 [&>button]:grid [&>button]:h-9 [&>button]:w-9 [&>button]:place-items-center [&>button]:rounded-full [&>button]:bg-white [&>button]:text-black [&>button]:opacity-100 [&>button]:shadow-lg [&>button]:ring-1 [&>button]:ring-black/10 [&>button:hover]:bg-white [&>button:hover]:scale-105 [&>button]:transition-transform [&>button_svg]:h-[1.2rem] [&>button_svg]:w-[1.2rem]">
        <div className="relative max-h-[85vh] overflow-y-auto">
          <PopupCard
            key={current.id}
            popup={current}
            onClose={() => handleOpenChange(false)}
            dontShowAgain={!!dsa[current.id]}
            onDontShowAgainChange={(v) => setDsa((s) => ({ ...s, [current.id]: v }))}
          />

          {multiple && (
            <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-3">
              <button
                type="button"
                aria-label="Anterior"
                onClick={() => setIndex((i) => (i - 1 + queue.length) % queue.length)}
                className="grid h-8 w-8 place-items-center rounded-full border border-border hover:bg-secondary"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1.5">
                {queue.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={`Ir para o pop-up ${i + 1}`}
                    onClick={() => setIndex(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === index ? "w-5 bg-foreground" : "w-2 bg-muted-foreground/40"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="Próximo"
                onClick={() => setIndex((i) => (i + 1) % queue.length)}
                className="grid h-8 w-8 place-items-center rounded-full border border-border hover:bg-secondary"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
