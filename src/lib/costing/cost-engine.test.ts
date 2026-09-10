import { describe, expect, it } from 'vitest';
import type { BlockCalculationResult } from '../types';
import { adaptBlockResultToCostHours } from './cost-hours-adapter';
import { calculateCosting, projectCostingForCommercial } from './cost-engine';
import {
  calculateClosingPriceFromDiscount,
  calculateCommercialResult,
  calculatePriceRange,
} from './commercial-policy';
import type { CommercialPolicy, CostingInput } from './cost-types';

// Synthetic values used only to exercise formulas. They are not GASI defaults.
const TEST_COMMERCIAL_POLICY: Readonly<CommercialPolicy> = Object.freeze({
  gasiMarkupOnCostPercent: 40,
  commercialFloorOnCostPercent: 12,
  commercialBufferOnCostPercent: 8,
  commissionAtFloorPercent: 12,
  commissionIntermediatePercent: 13.5,
  commissionAtListPercent: 15,
  semaphoreTargetReturnOnCostPercent: 40,
  semaphoreReviewReturnOnCostPercent: 30,
});

function baseInput(overrides: Partial<CostingInput> = {}): CostingInput {
  const verifiedSource = {
    id: 'verified-source',
    label: 'Dato verificado para caso dorado',
    status: 'verified' as const,
  };
  const input: CostingInput = {
    serviceId: 'golden-service-1',
    professionalProfile: 'Enfermería',
    province: 'Madrid',
    hours: {
      coverageHours: 140,
      workingDays: 20,
      shifts: 20,
      breakdown: {
        total: 140,
        regular: 130,
        night: 10,
        sunday: 0,
        holiday: 5,
        holidayNational: 5,
        holidayAutonomico: 0,
        holidayProvincial: 0,
        holidayMunicipal: 0,
        weekend: 0,
      },
    },
    salary: {
      annualOrdinaryBaseSalary: 12_000,
      extraPay: {
        paymentsPerYear: 2,
        amountPerPayment: 1_000,
        paymentMode: 'separate',
      },
      annualFixedSupplements: 0,
      annualOtherSalaryItems: 0,
      annualConventionHours: 1_680,
      annualProductiveHours: 1_400,
      smiAnnual: 10_000,
      source: verifiedSource,
    },
    plusRules: [
      {
        id: 'night',
        name: 'Nocturnidad',
        formula: 'per_hour',
        value: 5,
        hourBucket: 'night',
        source: verifiedSource,
      },
      {
        id: 'national-holiday',
        name: 'Festivo nacional',
        formula: 'percentage_base_hour',
        value: 20,
        hourBucket: 'holidayNational',
        source: verifiedSource,
      },
    ],
    employerContributions: {
      commonContingenciesPercent: 20,
      unemploymentPercent: 5,
      fogasaPercent: 1,
      vocationalTrainingPercent: 1,
      meiPercent: 1,
      otherPercent: 2,
      source: verifiedSource,
    },
    occupationalRisk: {
      temporaryDisabilityPercent: 2,
      disabilityDeathSurvivorPercent: 1,
      source: verifiedSource,
    },
    contract: {
      contractType: 'temporal',
      laborContracts: 2,
      managementFeePerLaborContract: 15,
      terminationProvisionPercent: 5,
      otherFixedContractCosts: 20,
    },
    overhead: {
      percentageOnExpandedLabor: 15,
      fixedAmount: 0,
    },
    directCosts: [
      { id: 'travel', name: 'Desplazamiento', amount: 100, category: 'travel' },
    ],
    commercialPolicy: { ...TEST_COMMERCIAL_POLICY },
    calculatedAt: '2026-07-14T20:00:00.000Z',
  };

  return { ...input, ...overrides };
}

describe('Cost engine — complete unavoidable cost', () => {
  it('includes extra pay, contributions, AT/EP, contracts, termination, overhead and direct costs', () => {
    const result = calculateCosting(baseInput());

    expect(result.status).toBe('calculated');
    if (result.status !== 'calculated') return;

    expect(result.internalCost.labor.annualExtraPay).toBe(2_000);
    expect(result.internalCost.labor.contractualAnnualSalary).toBe(14_000);
    expect(result.internalCost.labor.productiveHourlySalaryCost).toBe(10);
    expect(result.internalCost.labor.salaryForService).toBe(1_400);
    expect(result.internalCost.labor.totalPluses).toBe(60);
    expect(result.internalCost.labor.totalEmployerContributions).toBe(438);
    expect(result.internalCost.labor.totalOccupationalRisk).toBe(43.8);
    expect(result.internalCost.labor.expandedLaborCost).toBe(1_941.8);
    expect(result.internalCost.managementCost).toBe(30);
    expect(result.internalCost.terminationProvision).toBe(73);
    expect(result.internalCost.otherContractCosts).toBe(20);
    expect(result.internalCost.overhead).toBe(324.72);
    expect(result.internalCost.totalDirectCosts).toBe(100);
    expect(result.internalCost.totalInternalCost).toBe(2_489.52);
  });

  it('does not erase or duplicate extra pay when it is prorated', () => {
    const separate = calculateCosting(baseInput());
    const proratedInput = baseInput();
    proratedInput.salary.extraPay.paymentMode = 'prorated';
    const prorated = calculateCosting(proratedInput);

    expect(separate.status).toBe('calculated');
    expect(prorated.status).toBe('calculated');
    if (separate.status !== 'calculated' || prorated.status !== 'calculated') return;

    expect(prorated.internalCost.labor.annualExtraPay).toBe(2_000);
    expect(prorated.internalCost.labor.applicableAnnualSalary)
      .toBe(separate.internalCost.labor.applicableAnnualSalary);
    expect(prorated.internalCost.totalInternalCost)
      .toBe(separate.internalCost.totalInternalCost);
  });

  it('applies the SMI floor without losing the contractual salary trace', () => {
    const input = baseInput();
    input.salary.annualOrdinaryBaseSalary = 8_000;
    input.salary.extraPay = { paymentsPerYear: 2, amountPerPayment: 500, paymentMode: 'prorated' };
    input.salary.smiAnnual = 12_000;

    const result = calculateCosting(input);
    expect(result.status).toBe('calculated');
    if (result.status !== 'calculated') return;

    expect(result.internalCost.labor.contractualAnnualSalary).toBe(9_000);
    expect(result.internalCost.labor.smiAdjustmentAnnual).toBe(3_000);
    expect(result.internalCost.labor.applicableAnnualSalary).toBe(12_000);
  });

  it('returns a controlled pending state instead of calculating with missing data', () => {
    const input = baseInput();
    input.salary.annualProductiveHours = 0;
    input.occupationalRisk.temporaryDisabilityPercent = Number.NaN;

    const result = calculateCosting(input);

    expect(result.status).toBe('pending_configuration');
    if (result.status !== 'pending_configuration') return;
    expect(result.action).toBe('complete_in_administration');
    expect(result.issues.map((issue) => issue.field)).toContain('salary.annualProductiveHours');
    expect(result.issues.map((issue) => issue.field)).toContain('occupationalRisk.temporaryDisabilityPercent');
  });

  it('blocks unverified legal or labor sources', () => {
    const input = baseInput();
    if (input.salary.source) input.salary.source.status = 'pending_advisor';

    const result = calculateCosting(input);

    expect(result.status).toBe('pending_configuration');
    if (result.status !== 'pending_configuration') return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'salary.source', kind: 'blocked' }),
    ]));
  });

  it('requires an explicit verified rule for every applicable special-hour concept', () => {
    const input = baseInput();
    input.plusRules = input.plusRules.filter((plus) => plus.hourBucket !== 'night');

    const result = calculateCosting(input);

    expect(result.status).toBe('pending_configuration');
    if (result.status !== 'pending_configuration') return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'plusRules.night', kind: 'missing' }),
    ]));
  });

  it('handles a structurally empty payload as pending configuration without throwing', () => {
    expect(() => calculateCosting({} as CostingInput)).not.toThrow();
    const result = calculateCosting({} as CostingInput);
    expect(result.status).toBe('pending_configuration');
  });
});

describe('Commercial policy — synthetic formula fixture', () => {
  it('constructs the ordinary floor at cost × 1.52 and the list price at cost × 1.60', () => {
    const result = calculateCosting(baseInput());
    expect(result.status).toBe('calculated');
    if (result.status !== 'calculated') return;

    expect(result.commercial.minimumOrdinaryPriceExVat).toBe(3_784.07);
    expect(result.commercial.initialListPriceExVat).toBe(3_983.23);
    expect(result.commercial.closingPriceExVat).toBe(3_983.23);
  });

  it('uses the synthetic floor commission and measures GASI return after commission', () => {
    const first = calculateCosting(baseInput());
    expect(first.status).toBe('calculated');
    if (first.status !== 'calculated') return;

    const input = baseInput({
      closingPriceExVat: first.commercial.minimumOrdinaryPriceExVat,
    });
    const result = calculateCosting(input);
    expect(result.status).toBe('calculated');
    if (result.status !== 'calculated') return;

    expect(result.commercial.commissionTier).toBe('floor');
    expect(result.commercial.commissionRatePercent).toBe(12);
    expect(result.commercial.netBeforeCommission).toBe(1_294.55);
    expect(result.commercial.commissionAmount).toBe(155.35);
    expect(result.commercial.finalGasiBenefit).toBe(1_139.2);
    expect(result.commercial.gasiReturnOnCostPercent).toBeCloseTo(45.76, 2);
    expect(result.commercial.semaphore).toBe('green');
    expect(result.commercial.commercialBufferConsumedPercentOfCost).toBeCloseTo(8, 2);
  });

  it('uses the synthetic list commission at the initial list price', () => {
    const result = calculateCosting(baseInput());
    expect(result.status).toBe('calculated');
    if (result.status !== 'calculated') return;

    expect(result.commercial.commissionTier).toBe('list');
    expect(result.commercial.commissionRatePercent).toBe(15);
    expect(result.commercial.clientDiscountAmount).toBe(0);
  });

  it('uses the synthetic intermediate commission in the negotiation band', () => {
    const first = calculateCosting(baseInput());
    expect(first.status).toBe('calculated');
    if (first.status !== 'calculated') return;

    const midpoint = (
      first.commercial.minimumOrdinaryPriceExVat
      + first.commercial.initialListPriceExVat
    ) / 2;
    const result = calculateCosting(baseInput({ closingPriceExVat: midpoint }));
    expect(result.status).toBe('calculated');
    if (result.status !== 'calculated') return;

    expect(result.commercial.commissionTier).toBe('intermediate');
    expect(result.commercial.commissionRatePercent).toBe(13.5);
  });

  it('maps the full negotiable discount to the exact floor despite cent rounding', () => {
    const totalInternalCost = 1_000.16;
    const policy = { ...TEST_COMMERCIAL_POLICY };
    const range = calculatePriceRange(totalInternalCost, policy);
    const closingPriceExVat = calculateClosingPriceFromDiscount({
      totalInternalCost,
      requestedDiscountPercent: 5,
      policy,
    });
    const result = calculateCommercialResult({
      totalInternalCost,
      closingPriceExVat,
      policy,
    });

    expect(closingPriceExVat).toBe(range.minimumOrdinaryPriceExVat);
    expect(result.commissionTier).toBe('floor');
    expect(result.commissionRatePercent).toBe(12);
  });

  it.each([1, 2.5, 4.99])(
    'keeps a %s%% client discount in the intermediate commission tier',
    (requestedDiscountPercent) => {
      const totalInternalCost = 1_000.16;
      const policy = { ...TEST_COMMERCIAL_POLICY };
      const closingPriceExVat = calculateClosingPriceFromDiscount({
        totalInternalCost,
        requestedDiscountPercent,
        policy,
      });
      const result = calculateCommercialResult({
        totalInternalCost,
        closingPriceExVat,
        policy,
      });

      expect(result.commissionTier).toBe('intermediate');
      expect(result.commissionRatePercent).toBe(13.5);
    },
  );

  it('blocks a service closing price below the synthetic ordinary floor', () => {
    const result = calculateCosting(baseInput({ closingPriceExVat: 3_000 }));

    expect(result.status).toBe('blocked_closing_price');
    if (result.status !== 'blocked_closing_price') return;
    expect(result.allowedRange.minimumOrdinaryPriceExVat).toBe(3_784.07);
  });

  it('commercial projection contains no salary, cost, margin or commission amount', () => {
    const result = calculateCosting(baseInput());
    const projection = projectCostingForCommercial(result);
    const serialized = JSON.stringify(projection);

    expect(projection.status).toBe('calculated');
    expect(serialized).not.toContain('salary');
    expect(serialized).not.toContain('internalCost');
    expect(serialized).not.toContain('commission');
    expect(serialized).not.toContain('finalGasiBenefit');
  });
});

describe('Calendar adapter', () => {
  it('multiplies per-position breakdown by simultaneous positions without multiplying by rotation staff', () => {
    const block: BlockCalculationResult = {
      workingDates: ['2026-07-13'],
      totalWorkingDays: 1,
      hoursPerPosition: 8,
      coverageHours: 16,
      totalHours: 8,
      shiftBreakdown: {
        total: 8,
        regular: 6,
        night: 2,
        sunday: 0,
        holiday: 0,
        holidayNational: 0,
        holidayAutonomico: 0,
        holidayProvincial: 0,
        holidayMunicipal: 0,
        weekend: 0,
      },
      surcharges: [],
      totalSurcharges: 0,
      puestosSimultaneos: 2,
      plantillaMinimaRecomendada: 4,
      plantillaSeleccionada: 4,
      deficitPlantilla: 0,
      weeklyHoursPerPro: [],
      overtimeHours: 0,
      laborWarnings: [],
      subtotal: 0,
      totalWithSurcharges: 0,
    };

    const adapted = adaptBlockResultToCostHours(block);

    expect(adapted.coverageHours).toBe(16);
    expect(adapted.breakdown.total).toBe(16);
    expect(adapted.breakdown.night).toBe(4);
    expect(adapted.workingDays).toBe(2);
    expect(adapted.shifts).toBe(2);
  });
});
