import { describe,it,expect } from 'vitest';
import { oauthReturnPath } from '../oauth-return-path';
import { authorizationTarget } from '../oauth-consent';
import { pagination, period, salesSummary } from './read-rules';
import { isAllowedPublicUrl, detectImageMagicBytes } from './media.server';

describe('OAuth return-path security',()=>{
  it('preserves consent authorization query and fragment',()=>expect(oauthReturnPath('/.lovable/oauth/consent?authorization_id=abc#return')).toBe('/.lovable/oauth/consent?authorization_id=abc#return'));
  it.each(['//attacker.example','/\\attacker.example','/\nattack','https://attacker.example','/%2f%2f/../..//attacker.example'])('rejects external or malformed redirect %s',value=>expect(oauthReturnPath(value)).toBe('/'));
  it('canonicalizes a local path once',()=>expect(oauthReturnPath('/auth/../.lovable/oauth/consent?authorization_id=1')).toBe('/.lovable/oauth/consent?authorization_id=1'));
  it('supports both provider redirect fields',()=>{
    expect(authorizationTarget({redirect_url:'https://chatgpt.com/callback?code=test'})).toBe('https://chatgpt.com/callback?code=test');
    expect(authorizationTarget({redirect_to:'https://chatgpt.com/callback'})).toBe('https://chatgpt.com/callback');
    expect(authorizationTarget({redirect_url:'javascript:alert(1)'})).toBeUndefined();
  });
});
describe('Bounded administrative queries',()=>{
  it('rejects more than 50 rows and invalid pages',()=>{
    expect(pagination.limite.safeParse(51).success).toBe(false);
    expect(pagination.pagina.safeParse(0).success).toBe(false);
    expect(period.dias.safeParse(367).success).toBe(false);
  });
  it('excludes unpaid values and subtracts refunds',()=>expect(salesSummary([{status:'paid',total_cents:900,refunded_cents:100},{status:'pending',total_cents:4900,refunded_cents:0}])).toMatchObject({pedidos:2,pedidos_pagos:1,faturamento_bruto_centavos:900,reembolsos_centavos:100,faturamento_liquido_centavos:800}));
});
describe('Existing media safeguards',()=>{
  it('retains private URL blocking',()=>expect(isAllowedPublicUrl('http://127.0.0.1:8080').allowed).toBe(false));
  it('retains magic byte detection',()=>expect(detectImageMagicBytes(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0]))?.mimeType).toBe('image/png'));
});
