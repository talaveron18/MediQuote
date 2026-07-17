import { describe, expect, it } from 'vitest';
import { hashBudgetForSignature, hashSignatureToken } from './budget-signature';

describe('firma de presupuesto', () => {
  it('produce una huella estable aunque cambie el orden de propiedades', () => {
    const a = hashBudgetForSignature({ id: '1', code: 'P-1', totalFinal: 100, client: { cif: 'B1', businessName: 'C' }, serviceBlocks: [] });
    const b = hashBudgetForSignature({ code: 'P-1', id: '1', client: { businessName: 'C', cif: 'B1' }, serviceBlocks: [], totalFinal: 100 });
    expect(a).toBe(b);
  });

  it('no almacena el token público en claro', () => {
    expect(hashSignatureToken('token-secreto')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSignatureToken('token-secreto')).not.toContain('token-secreto');
  });
});
