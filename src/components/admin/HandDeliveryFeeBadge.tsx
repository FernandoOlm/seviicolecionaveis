import { handDeliveryFeeLabel, isHandDeliveryFeePaid } from "@/lib/hand-delivery";

/** Âmbar = aguardando confirmação; verde = pago. */
export function HandDeliveryFeeBadge({ status, compact }: { status: string | null | undefined; compact?: boolean }) {
  const paid = isHandDeliveryFeePaid(status);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        paid
          ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
      }`}
    >
      {compact ? (paid ? "Taxa paga" : "Pagamento pendente") : handDeliveryFeeLabel(status)}
    </span>
  );
}
