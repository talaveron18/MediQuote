import { describe, expect, it } from 'vitest';
import { assertFiniteBudget, extractBudgetPatch, findManualChanges, looksNormative, mergeWithoutOverwriting } from './ai-budget';

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
});
