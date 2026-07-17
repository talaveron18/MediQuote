import { describe, expect, it } from 'vitest';
import { DEMO_SNAPSHOT } from './demo-provider';
import { calculateScenario } from './scenarios';

describe('escenarios deterministas', () => {
  it('el absentismo aumenta coste y reduce margen', () => {
    const result = calculateScenario(DEMO_SNAPSHOT, 'absentismo', 8);
    expect(result.adjustedCost).toBeGreaterThan(result.originalCost); expect(result.adjustedMargin).toBeLessThan(result.originalMargin);
  });
  it('rechaza porcentajes no finitos o fuera de rango', () => {
    expect(() => calculateScenario(DEMO_SNAPSHOT, 'absentismo', Number.NaN)).toThrow();
    expect(() => calculateScenario(DEMO_SNAPSHOT, 'descuento', 101)).toThrow();
  });
});
