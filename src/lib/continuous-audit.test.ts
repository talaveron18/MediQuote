import { describe, expect, it } from 'vitest';
import { calculateAuditDeviation, estimatedBreakdownFromSnapshot } from './continuous-audit';

describe('auditoría continua', () => {
  it('extrae el coste y sus componentes del snapshot inmutable', () => {
    const value = estimatedBreakdownFromSnapshot(JSON.stringify({ internalCost: {
      totalInternalCost: 150,
      directCostTotal: 10,
      directCostOverhead: 2,
      laborBlocks: [{
        labor: { salaryForService: 60, totalPluses: 5, totalEmployerContributions: 20, totalOccupationalRisk: 2 },
        managementCost: 4, terminationProvision: 3, otherContractCosts: 1, overhead: 8, totalDirectCosts: 5,
      }],
    } }));
    expect(value.total).toBe(150);
    expect(value.breakdown.socialSecurity).toBe(20);
    expect(value.breakdown.overhead).toBe(10);
    expect(value.breakdown.directCosts).toBe(15);
  });

  it('calcula y ordena las desviaciones por impacto', () => {
    const value = calculateAuditDeviation({
      estimatedCost: 1000, actualCost: 1100,
      estimatedBreakdown: { salary: 500, socialSecurity: 300 },
      actualBreakdown: { salary: 520, socialSecurity: 380 },
    });
    expect(value.deviationAmount).toBe(100);
    expect(value.deviationPercent).toBe(10);
    expect(value.analysis[0].key).toBe('socialSecurity');
  });
});
