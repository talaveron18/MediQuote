import { describe, expect, it } from 'vitest';
import { validateLegalParameterValue } from './legal-parameter-validation';

describe('legal parameter validation', () => {
  it.each(['JORNADA_MADRID_ANUAL', 'HORAS_FACTURABLES_BURGOS', 'SMI_ANNUAL_2026'])('rejects zero for %s', key => {
    expect(validateLegalParameterValue(key, '0')).toMatch(/mayores que cero/);
  });

  it('accepts a positive annual hours value', () => {
    expect(validateLegalParameterValue('HORAS_FACTURABLES_MADRID', '1293')).toBeNull();
  });
});
