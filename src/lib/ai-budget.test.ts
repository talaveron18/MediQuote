import { describe, expect, it } from 'vitest';
import { assertFiniteBudget, EXTERNAL_SOURCE_DISCLAIMER, extractBudgetPatch, findManualChanges, LEGAL_DISCLAIMER, looksNormative, mergeWithoutOverwriting } from './ai-budget';

describe('AI budget boundary', () => {
  it('extracts operational data but no prices', () => {
    const result = extractBudgetPatch('Necesito 2 enfermeros de lunes a viernes, 8 h de mañana, septiembre octubre y noviembre de 2026 en Madrid');
    expect(result.block?.professionalCategory).toBe('Enfermero/a');
    expect(result.block?.hoursPerDay).toBe(8);
    expect(result.block?.daysOfWeek).toEqual([1,2,3,4,5]);
    expect(result.block).not.toHaveProperty('pricePerHour');
  });
  it('recognises normative questions', () => expect(looksNormative('¿Qué convenio laboral aplica?')).toBe(true));
  it('does not treat a service description as normative', () => expect(looksNormative('Necesito un médico el domingo')).toBe(false));
  it('preserves manually changed fields', () => {
    const current = { hours: 10, shift: 'night' };
    const last = { hours: 8, shift: 'night' };
    const protectedFields = findManualChanges(current, last);
    expect(mergeWithoutOverwriting(current, { hours: 12, shift: 'morning' }, protectedFields)).toEqual({ hours: 10, shift: 'morning' });
  });
  it('rejects non finite nested totals', () => expect(assertFiniteBudget({ total: Infinity })).toBe(false));
  it('extracts a doctor', () => expect(extractBudgetPatch('un médico en Madrid').block?.professionalCategory).toBe('Médico/a'));
  it('extracts a TCAE', () => expect(extractBudgetPatch('necesito una TCAE').block?.professionalCategory).toBe('TCAE'));
  it('extracts a night shift', () => expect(extractBudgetPatch('enfermera de noche').block?.shiftType).toBe('night'));
  it('extracts a 24 hour shift', () => expect(extractBudgetPatch('médico domingo 24 h').block?.shiftType).toBe('24h'));
  it('extracts Sunday', () => expect(extractBudgetPatch('médico el domingo').block?.daysOfWeek).toEqual([0]));
  it('extracts an afternoon shift', () => expect(extractBudgetPatch('enfermera de tarde').block?.shiftType).toBe('afternoon'));
  it('extracts a temporary contract', () => expect(extractBudgetPatch('contrato temporal para enfermera').block?.contractType).toBe('temporal'));
  it('extracts an indefinite contract', () => expect(extractBudgetPatch('contrato indefinido para médico').block?.contractType).toBe('indefinido'));
  it('extracts Castilla-La Mancha', () => expect(extractBudgetPatch('servicio en Castilla-La Mancha').budget?.serviceAutonomousCommunity).toBe('Castilla-La Mancha'));
  it('extracts Castilla y León', () => expect(extractBudgetPatch('servicio en Castilla y León').budget?.serviceAutonomousCommunity).toBe('Castilla y León'));
  it('extracts multiple consecutive months', () => {
    const block = extractBudgetPatch('septiembre octubre y noviembre de 2026').block;
    expect(block?.dateRangeStart).toBe('2026-09-01');
    expect(block?.dateRangeEnd).toBe('2026-11-30');
  });
  it('asks at most two necessary questions', () => expect(extractBudgetPatch('necesito cobertura').questions.length).toBeLessThanOrEqual(2));
  it('asks for category when absent', () => expect(extractBudgetPatch('servicio en Madrid').questions.join(' ')).toContain('categoría'));
  it('does not extract an internal cost', () => expect(extractBudgetPatch('médico 8 h').block).not.toHaveProperty('internalCostPerHour'));
  it('does not extract a selling price', () => expect(extractBudgetPatch('médico 8 h por 500 euros').block).not.toHaveProperty('fixedPrice'));
  it('merges an unprotected field', () => expect(mergeWithoutOverwriting({ hours: 8 }, { hours: 12 }, new Set())).toEqual({ hours: 12 }));
  it('accepts a finite nested result', () => expect(assertFiniteBudget({ total: 2, rows: [1, 3] })).toBe(true));
  it('keeps the mandatory professional disclaimer text', () => expect(LEGAL_DISCLAIMER).toContain('profesional cualificado'));
  it('keeps the external source warning', () => expect(EXTERNAL_SOURCE_DISCLAIMER).toContain('fuentes externas'));
  it('recognises a tax question', () => expect(looksNormative('¿Qué IVA aplica a esta factura?')).toBe(true));
});
