import { describe, expect, it } from 'vitest';
import { generateBudgetHTML, generateCommercialBudgetHTML } from './route';

describe('client/commercial PDF template', () => {
  const budget = {
    code: 'PRES-20260715-001', status: 'enviado', createdAt: '2026-07-15', validUntil: '2026-08-15',
    subtotal: 1600, totalSurcharges: 0, discountAmount: 50, discountPercent: 3.125,
    ivaPercent: 21, ivaAmount: 325.5, totalFinal: 1875.5,
    description: 'Cobertura sanitaria', clientNotes: 'Propuesta válida',
    serviceAutonomousCommunity: 'Castilla y León', serviceProvince: 'Burgos', serviceMunicipality: 'Burgos',
    client: { businessName: 'Cliente Ejemplo', cif: 'B00000000', fiscalAddress: 'Burgos', paymentTerms: '30 días' },
    serviceBlocks: [{
      serviceName: 'Servicio médico', professionalCategory: 'Médico', totalWorkingDays: 1,
      totalHours: 8, selectedProfessionals: 1, overtimeHours: 0, surchargeBreakdown: null,
      blockClosingPrice: 1550, ivaPercent: 21, ivaAmount: 325.5, blockTotalFinal: 1875.5,
    }],
  };

  it('includes GASI branding and service location', () => {
    const html = generateBudgetHTML(budget, {});
    expect(html).toContain('/branding/gasi-logo.png');
    expect(html).toContain('Grupo de Asistencia Sanitaria Integral');
    expect(html).toContain('coordinacion@gasisalud.com');
    expect(html).toContain('Burgos, Burgos, Castilla y León');
  });

  it('never includes internal cost or commission data', () => {
    const html = generateBudgetHTML({ ...budget, internalNotes: 'SECRETO', internalCost: 1000, commissionAmount: 120 }, {});
    expect(html).not.toContain('SECRETO');
    expect(html).not.toContain('internalCost');
    expect(html).not.toContain('commission');
  });

  it('shows the sale price and IVA of every service block', () => {
    const html = generateBudgetHTML(budget, {});
    expect(html).toContain('Precio sin IVA');
    expect(html).toContain('IVA (21,00%)');
    expect(html).toContain('Total partida');
    expect(html).toContain('IVA por partidas');
  });

  it('puts client sending only in the client document', () => {
    const client = generateBudgetHTML({ ...budget, id: 'budget-1', client: { ...budget.client, email: 'cliente@example.com' } }, {}, { enableSignatureSend: true });
    expect(client).toContain('Enviar al cliente para firma');
    expect(client).toContain('/api/signatures');
    expect(client).not.toContain('Ver firma / aceptación');

    const commercial = generateCommercialBudgetHTML(generateBudgetHTML(budget, {}), { commissionRatePercent: 15, commissionAmount: 100 });
    expect(commercial).toContain('DOCUMENTO COMERCIAL — USO INTERNO');
    expect(commercial).not.toContain('Enviar al cliente para firma');
    expect(commercial).not.toContain('Ver firma / aceptación');
  });
});
