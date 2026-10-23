import { describe, it, expect } from 'vitest';
import { isCriticalStatusChange, definedFields, chave } from './write-rules';
import { confirmationPhrase, requireConfirmation } from './access';
describe('MCP write rules', () => {
  it('cancelar exige confirmação', () => expect(isCriticalStatusChange('paid', 'cancelled')).toBe(true));
  it('marcar pago exige confirmação', () => expect(isCriticalStatusChange('pending', 'paid')).toBe(true));
  it('reabrir cancelado exige confirmação', () => expect(isCriticalStatusChange('cancelled', 'pending')).toBe(true));
  it('separar não exige confirmação', () => expect(isCriticalStatusChange('paid', 'separated')).toBe(false));
  it('confirmação vinculada ao alvo', () => {
    const id = 'abcdef12-0000-4000-8000-000000000000';
    expect(confirmationPhrase(id)).toBe('CONFIRMAR ABCDEF12');
    expect(() => requireConfirmation(undefined, id, 'x')).toThrow();
    expect(() => requireConfirmation('CONFIRMAR 11111111', id, 'x')).toThrow();
    expect(() => requireConfirmation('confirmar abcdef12', id, 'x')).not.toThrow();
  });
  it('só grava campos informados', () => expect(definedFields({ a: 1, b: undefined })).toEqual({ a: 1 }));
  it('rejeita chave de idempotência curta', () => expect(chave.safeParse('abc').success).toBe(false));
});
