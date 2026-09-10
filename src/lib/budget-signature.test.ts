import { describe, expect, it } from 'vitest';
import { hashBudgetForSignature, hashSignatureToken } from './budget-signature';
import { signatureDocumentIsCurrent } from './signature-write-guard';

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    id: '1', code: 'P-1', clientId: 'c-1', status: 'borrador',
    validUntil: '2026-10-10', description: 'Cobertura sanitaria',
    subtotal: 100, discountPercent: 0, discountAmount: 0, ivaAmount: 21, totalFinal: 121,
    serviceLocationId: 'loc-1', serviceAutonomousCommunity: 'Madrid',
    serviceProvince: 'Madrid', serviceMunicipality: 'Madrid',
    client: { cif: 'B1', businessName: 'Cliente', fiscalAddress: 'Calle 1', email: 'cliente@example.com' },
    serviceBlocks: [{
      serviceName: 'Enfermería', professionalCategory: 'cat-1', specificDates: '["2026-10-01"]',
      dateRangeStart: null, dateRangeEnd: null, shiftType: 'morning', shiftStartTime: '08:00',
      shiftEndTime: '16:00', totalWorkingDays: 1, totalHours: 8, blockClosingPrice: 100,
      ivaPercent: 21, ivaAmount: 21, blockTotalFinal: 121,
    }],
    ...overrides,
  };
}

describe('firma de presupuesto', () => {
  it('produce una huella estable aunque cambie el orden de propiedades', () => {
    const a = hashBudgetForSignature({ id: '1', code: 'P-1', totalFinal: 100, client: { cif: 'B1', businessName: 'C' }, serviceBlocks: [] });
    const b = hashBudgetForSignature({ code: 'P-1', id: '1', client: { businessName: 'C', cif: 'B1' }, serviceBlocks: [], totalFinal: 100 });
    expect(a).toBe(b);
  });

  it('no invalida el enlace por el cambio interno borrador -> enviado', () => {
    const issued = fixture({ status: 'borrador' });
    const documentHash = hashBudgetForSignature(issued);
    expect(signatureDocumentIsCurrent(fixture({ status: 'enviado' }), documentHash)).toBe(true);
  });

  it('sí invalida el enlace cuando cambia contenido económico o documental', () => {
    const documentHash = hashBudgetForSignature(fixture());
    expect(signatureDocumentIsCurrent(fixture({ totalFinal: 150 }), documentHash)).toBe(false);
    expect(signatureDocumentIsCurrent(fixture({ description: 'Servicio distinto' }), documentHash)).toBe(false);
  });

  it('no almacena el token público en claro', () => {
    expect(hashSignatureToken('token-secreto')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSignatureToken('token-secreto')).not.toContain('token-secreto');
  });
});
