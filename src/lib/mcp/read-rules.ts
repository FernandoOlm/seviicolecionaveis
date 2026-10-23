import { z } from 'zod';
import { PAID_ORDER_STATUSES } from '@/lib/order-status';
export const pagination = {
  pagina: z.number().int().min(1).max(2000).default(1).describe('Página da consulta.'),
  limite: z.number().int().min(1).max(50).default(20).describe('Resultados por página, no máximo 50.'),
};
export const period = { dias: z.number().int().min(1).max(366).default(30).describe('Período em dias, até 366.') };
export function salesSummary(rows: readonly { status: string; total_cents: number; refunded_cents: number }[]) {
  const paid = rows.filter(r => PAID_ORDER_STATUSES.some(s => s === r.status));
  const gross = paid.reduce((n, r) => n + r.total_cents, 0);
  const refunds = rows.reduce((n, r) => n + r.refunded_cents, 0);
  const statuses: Record<string, number> = {};
  for (const row of rows) statuses[row.status] = (statuses[row.status] ?? 0) + 1;
  return { pedidos: rows.length, pedidos_pagos: paid.length, faturamento_bruto_centavos: gross, reembolsos_centavos: refunds, faturamento_liquido_centavos: gross - refunds, status: statuses };
}
