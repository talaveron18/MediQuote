import { describe, expect, it } from 'vitest';
import { calculateAuditDeviation, estimatedBreakdownFromSnapshot } from './continuous-audit';

describe('auditoría continua', () => {
  it('separa conceptos conciliables con gestoría de conceptos internos GASI', () => {
    const value = estimatedBreakdownFromSnapshot(JSON.stringify({
      internalCost: {
        totalInternalCost: 120,
        labor: {
          salaryForService: 60,
          totalPluses: 5,
          totalEmployerContributions: 20,
          totalOccupationalRisk: 2,
        },
        managementCost: 4,
        terminationProvision: 3,
        otherContractCosts: 1,
        overhead: 10,
        totalDirectCosts: 15,
      },
      commercial: { commissionAmount: 8, finalGasiBenefit: 22 },
    }));

    expect(value.total).toBe(120);
    expect(value.gestoriaBreakdown.socialSecurity).toBe(20);
    expect(value.gestoriaBreakdown.contractCosts).toBe(8);
    expect(value.internalBreakdown.overhead).toBe(10);
    expect(value.internalBreakdown.directCosts).toBe(15);
    expect(value.internalBreakdown.commercialCommission).toBe(8);
    expect(value.internalBreakdown.gasiBenefit).toBe(22);
    expect(value.gestoriaBreakdown).not.toHaveProperty('overhead');
    expect(value.gestoriaBreakdown).not.toHaveProperty('commercialCommission');
  });

  it('marca verde conceptual solo cuando motor y gestoría son idénticos en conceptos conciliables', () => {
    const value = calculateAuditDeviation({
      estimatedCost: 1000,
      actualCost: 1000,
      estimatedBreakdown: { salary: 500, socialSecurity: 300, overhead: 50 },
      actualBreakdown: { salary: 500, socialSecurity: 300 },
    });

    expect(value.analysis.find((line) => line.key === 'salary')?.status).toBe('match');
    expect(value.analysis.find((line) => line.key === 'socialSecurity')?.status).toBe('match');
    expect(value.analysis.some((line) => String(line.key) === 'overhead')).toBe(false);
    expect(value.internalAnalysis.find((line) => line.key === 'overhead')).toEqual(expect.objectContaining({
      amount: 50,
      status: 'internal',
    }));
  });

  it('marca discrepancias y conserva conceptos de gestoría no informados sin fingir coincidencia', () => {
    const value = calculateAuditDeviation({
      estimatedCost: 1000,
      actualCost: 1100,
      estimatedBreakdown: { salary: 500, socialSecurity: 300, pluses: 50 },
      actualBreakdown: { salary: 520, socialSecurity: 300 },
    });

    expect(value.deviationAmount).toBe(100);
    expect(value.deviationPercent).toBe(10);
    expect(value.analysis.find((line) => line.key === 'salary')).toEqual(expect.objectContaining({
      actual: 520,
      deviationAmount: 20,
      status: 'mismatch',
    }));
    expect(value.analysis.find((line) => line.key === 'socialSecurity')?.status).toBe('match');
    expect(value.analysis.find((line) => line.key === 'pluses')?.status).toBe('not_provided');
  });
});
