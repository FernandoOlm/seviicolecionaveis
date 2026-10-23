import { describe, expect, it } from 'vitest';
import { normalizeBrazilianPhone, resolvePaymentCpf, validCpf } from './customer-payment';
describe('auction customer payment rules', () => {
  it('matches Brazilian country code and formatting', () => {
    expect(normalizeBrazilianPhone('+55 (79) 98866-6663')).toBe('7988666663');
    expect(normalizeBrazilianPhone('7988666663')).toBe('7988666663');
  });
  it('tolerates only the optional ninth digit', () => {
    expect(normalizeBrazilianPhone('79888666663')).toBeNull();
    expect(normalizeBrazilianPhone('79988666663')).toBe('7988666663');
  });
  it('does not identify a WhatsApp internal ID as a phone', () => {
    expect(normalizeBrazilianPhone('310702384006927')).toBeNull();
    expect(normalizeBrazilianPhone('')).toBeNull();
  });
  it('uses the account CPF when the auction order has none', () => {
    expect(resolvePaymentCpf('529.982.247-25', null)).toBe('52998224725');
  });
  it('keeps the existing order CPF as a valid fallback', () => {
    expect(resolvePaymentCpf(null, '52998224725')).toBe('52998224725');
  });
  it('requires correction of missing or invalid CPF', () => {
    expect(resolvePaymentCpf(null, null)).toBeNull();
    expect(validCpf('11111111111')).toBeNull();
    expect(validCpf('52998224724')).toBeNull();
  });
});