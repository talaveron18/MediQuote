import { describe, expect, it } from 'vitest';
import type { BlockCalculationResult, ServiceBlockInput } from '../types';
import { calculateCosting } from './cost-engine';
import { buildCostingInputFromDatabase } from './server-input';

const legalParameters = {
  JORNADA_MADRID_ANUAL: 1680,
  HORAS_FACTURABLES_MADRID: 1293,
  SMI_ANNUAL_2026: 17094,
  SS_CC_EMPRESA: 23.6,
  SS_DESEMPLEO_INDEFINIDO_EMPRESA: 5.5,
  SS_DESEMPLEO_TEMPORAL_EMPRESA: 6.7,
  SS_FOGASA_EMPRESA: 0.2,
  SS_FORMACION_EMPRESA: 0.6,
  SS_MEI_EMPRESA_2026: 0.75,
  SS_ATEP_ORIENTATIVO: 1.5,
};

const block: ServiceBlockInput = {
  serviceName: 'Enfermería domingo',
  professionalCategory: 'nurse-id',
  puestosSimultaneos: 1,
  plantillaSeleccionada: 1,
  pricePerHour: 0,
  contractType: 'temporal',
  dateMode: 'specific',
  specificDates: ['2026-07-19'],
  excludeSundays: false,
  excludeHolidays: false,
  shiftType: '24h',
  shiftStartTime: '00:00',
  shiftEndTime: '23:59',
  hoursPerDay: 24,
  breakMinutes: 0,
  unitType: 'turno',
  quantity: 1,
};

function schedule(hours: number): BlockCalculationResult {
  return {
    workingDates: ['2026-07-19'],
    totalWorkingDays: 1,
    hoursPerPosition: hours,
    coverageHours: hours,
    totalHours: hours,
    shiftBreakdown: {
      total: hours,
      regular: Math.max(0, hours - Math.min(8, hours)),
      night: Math.min(8, hours),
      sunday: hours,
      holiday: 0,
      holidayNational: 0,
      holidayAutonomico: 0,
      holidayProvincial: 0,
      holidayMunicipal: 0,
      weekend: hours,
    },
    surcharges: [],
    totalSurcharges: 0,
    puestosSimultaneos: 1,
    plantillaMinimaRecomendada: 1,
    plantillaSeleccionada: 1,
    deficitPlantilla: 0,
    weeklyHoursPerPro: [],
    overtimeHours: 0,
    laborWarnings: [],
    subtotal: 0,
    totalWithSurcharges: 0,
  };
}

const config = {
  legalParameters,
  appConfig: {
    costing_province: 'Madrid',
    costing_overhead_percent: '15',
    costing_management_fee_per_contract: '60',
  },
  surcharges: [
    { id: 'night', name: 'Nocturnidad', type: 'nocturnidad', surchargeType: 'percentage', value: 25 },
    { id: 'sunday', name: 'Domingo', type: 'domingo', surchargeType: 'percentage', value: 50 },
    { id: 'weekend', name: 'Fin de semana', type: 'fin_de_semana', surchargeType: 'percentage', value: 25 },
    { id: 'holiday', name: 'Festivo', type: 'festivo', surchargeType: 'percentage', value: 60 },
  ],
};

describe('Adaptador servidor — pantalla comercial al motor económico', () => {
  it.each([8, 12, 24])('acepta un turno dominical de %s horas sin doble plus de fin de semana', (hours) => {
    const built = buildCostingInputFromDatabase({
      block: { ...block, hoursPerDay: hours },
      schedule: schedule(hours),
      category: { id: 'nurse-id', name: 'Enfermero', defaultInternalCost: 14 },
      config,
      serviceId: '0',
    });

    expect(built.status).toBe('ready');
    if (built.status !== 'ready') return;
    expect(built.input.hours.coverageHours).toBe(hours);
    expect(built.input.hours.breakdown.sunday).toBe(hours);
    expect(built.input.hours.breakdown.weekend).toBe(0);
    expect(built.input.salary.extraPay.paymentsPerYear).toBe(2);
    expect(built.input.salary.extraPay.paymentMode).toBe('prorated');
    expect(built.input.overhead.percentageOnExpandedLabor).toBe(15);

    const result = calculateCosting(built.input);
    expect(result.status).toBe('calculated');
    if (result.status !== 'calculated') return;
    expect(result.commercial.initialListPriceExVat)
      .toBeCloseTo(result.internalCost.totalInternalCost * 1.6, 1);
  });

  it('bloquea el cálculo si no está configurado el coste privado de gestoría', () => {
    const built = buildCostingInputFromDatabase({
      block,
      schedule: schedule(24),
      category: { id: 'nurse-id', name: 'Enfermero', defaultInternalCost: 14 },
      config: { ...config, appConfig: { ...config.appConfig, costing_management_fee_per_contract: '' } },
      serviceId: '0',
    });

    expect(built.status).toBe('pending_configuration');
    if (built.status !== 'pending_configuration') return;
    expect(built.issues.map((issue) => issue.field))
      .toContain('appConfig.costing_management_fee_per_contract');
  });
});
