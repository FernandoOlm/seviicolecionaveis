import { z } from 'zod';
export const uuid = z.string().uuid();
export const chave = z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/).describe('Chave de idempotência única por operação (ex.: um UUID). Repetir a mesma chave não repete a alteração.');
export const confirmacao = z.string().max(40).optional().describe('Obrigatória em ações críticas: frase "CONFIRMAR <8 primeiros caracteres do id>", após confirmação explícita do administrador.');
export const centavos = z.number().int().min(0).max(100_000_000);
export const estoque = z.number().int().min(0).max(100_000);
export const PRODUCT_TABLES = { lacrados: 'sealed_products', acessorios: 'accessories', videogames: 'videogames' } as const;
export const CRITICAL_ORDER_STATUSES = ['cancelled', 'paid', 'delivered'] as const;
/** Status changes that cancel, mark paid (moves stock/points) or finalize are irreversible. */
export function isCriticalStatusChange(from: string, to: string): boolean {
  return from !== to && (CRITICAL_ORDER_STATUSES.some(s => s === to) || from === 'cancelled');
}
/** Removes undefined keys so only provided fields are written. */
export function definedFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
