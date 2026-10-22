import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { setHandDeliveryFeeFn } from "@/lib/hand-delivery.functions";
import { isHandDeliveryArea, isHandDeliveryFeePaid, HAND_DELIVERY_OUT_OF_AREA_WARNING } from "@/lib/hand-delivery";
import { HandDeliveryFeeBadge } from "./HandDeliveryFeeBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function HandDeliveryFeePanel({ order, onSaved }: { order: any; onSaved: () => void | Promise<void> }) {
  const setFee = useServerFn(setHandDeliveryFeeFn);
  const paid = isHandDeliveryFeePaid(order.hand_delivery_fee_status);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const outOfArea = !isHandDeliveryArea({ city: order.city, state: order.state, cep: order.cep });
  const history: any[] = Array.isArray(order.hand_delivery_fee_history) ? order.hand_delivery_fee_history : [];

  const save = async () => {
    setSaving(true);
    try {
      await setFee({ data: { orderId: order.id, confirmed: !paid, note: note.trim() || null } });
      toast.success(!paid ? "Pagamento da entrega confirmado" : "Confirmação desfeita");
      setOpen(false); setNote("");
      await onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-2">
      {outOfArea && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
          ⚠ {HAND_DELIVERY_OUT_OF_AREA_WARNING} ({order.city || "cidade não informada"}/{order.state || "—"}). Edite o envio ou mantenha, se preferir.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">Taxa R$ 15,00 (Pix):</span>
        <HandDeliveryFeeBadge status={order.hand_delivery_fee_status} />
        <button type="button" onClick={() => setOpen(true)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
          {paid ? "Desfazer confirmação" : "Confirmar pagamento da entrega"}
        </button>
      </div>
      {history.length > 0 && (
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
          {history.map((h, i) => (
            <li key={i}>
              {new Date(h.at).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })} — {h.admin_email ?? "admin"}:{" "}
              {h.next === "confirmed" ? "confirmou o pagamento" : "desfez a confirmação"} (antes: {h.previous === "confirmed" || h.previous === "paid" ? "pago" : "aguardando"})
              {h.note && <> · “{h.note}”</>}
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{paid ? "Desfazer confirmação do pagamento?" : "Confirmar pagamento da entrega?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {paid
                ? "O pagamento da taxa volta para “Aguardando confirmação”."
                : "A taxa de R$ 15 será marcada como paga e o cliente recebe um e-mail avisando."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px] bg-background" maxLength={500}
            placeholder='Observação (opcional) — ex: "comprovante recebido no WhatsApp às 14h"'
            value={note} onChange={(e) => setNote(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); void save(); }}>
              {saving ? "Salvando..." : paid ? "Desfazer" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
