import { describe, expect, it } from 'vitest';
import type { BlockCalculationResult, ServiceBlockInput } from '../types';
import { CONVENTION_PROFILES } from '../service-locations';
import { calculateCosting } from './cost-engine';
import { buildCostingInputFromDatabase } from './server-input';

const baseLegalParameters = {
  SMI_ANNUAL_2026: 17094,
  SS_CC_EMPRESA: 23.6,
  SS_DESEMPLEO_INDEFINIDO_EMPRESA: 5.5,
  SS_DESEMPLEO_TEMPORAL_EMPRESA: 6.7,
  SS_FOGASA_EMPRESA: 0.2,
  SS_FORMACION_EMPRESA: 0.6,
  SS_MEI_EMPRESA_2026: 0.75,
  SS_ATEP_ORIENTATIVO: 1.5,
};

const syntheticInternalEconomics = {
  costing_overhead_percent: '7.25',
  costing_termination_provision_percent_temp: '2.5',
  commercial_gasi_markup_on_cost_percent: '31',
  commercial_floor_on_cost_percent: '9',
  commercial_buffer_on_cost_percent: '6',
  commercial_commission_floor_percent: '8',
  commercial_commission_intermediate_percent: '9',
  commercial_commission_list_percent: '10',
  commercial_semaphore_green_return_on_cost_percent: '28',
  commercial_semaphore_yellow_return_on_cost_percent: '18',
};

const block: ServiceBlockInput = {
  serviceName: 'Enfermería domingo', professionalCategory: 'nurse-id', puestosSimultaneos: 1,
  plantillaSeleccionada: 1, pricePerHour: 0, contractType: 'temporal', dateMode: 'specific',
  specificDates: ['2026-07-19'], excludeSundays: false, excludeHolidays: false,
  shiftType: '24h', shiftStartTime: '00:00', shiftEndTime: '23:59', hoursPerDay: 24,
  breakMinutes: 0, unitType: 'turno', quantity: 1,
};

function schedule(hours: number, date = '2026-07-19'): BlockCalculationResult {
  return {
    workingDates: [date], totalWorkingDays: 1, hoursPerPosition: hours, coverageHours: hours,
    totalHours: hours, shiftBreakdown: {
      total: hours, regular: Math.max(0, hours - Math.min(8, hours)), night: Math.min(8, hours),
      sunday: hours, holiday: 0, holidayNational: 0, holidayAutonomico: 0,
      holidayProvincial: 0, holidayMunicipal: 0, weekend: hours,
    },
    surcharges: [], totalSurcharges: 0, puestosSimultaneos: 1, plantillaMinimaRecomendada: 1,
    plantillaSeleccionada: 1, deficitPlantilla: 0, weeklyHoursPerPro: [], overtimeHours: 0,
    laborWarnings: [], subtotal: 0, totalWithSurcharges: 0,
  };
}

function configFor(profileId: keyof typeof CONVENTION_PROFILES, extra: Record<string, number> = {}) {
  const profile = CONVENTION_PROFILES[profileId];
  const legalParameters: Record<string, number> = {
    ...baseLegalParameters,
    [profile.annualConventionHoursKey]: 1680,
    [profile.annualProductiveHoursKey]: 1293,
    ...extra,
  };
  const sourceKeys = new Set([
    ...profile.plusRules.map((rule) => rule.legalParameterKey),
    ...(profile.specialPlusRules ?? []).flatMap((rule) => [rule.legalParameterKey, rule.baseLegalParameterKey].filter(Boolean) as string[]),
  ]);
  const legalParameterSources = Object.fromEntries([...sourceKeys].map((key) => [key, {
    id: profile.legalRecordKey, label: profile.label, status: 'verified' as const,
  }]));
  const appConfig: Record<string, string> = {
    costing_province: 'Madrid',
    costing_management_fee_per_contract: '11.5',
    ...syntheticInternalEconomics,
  };
  return {
    legalParameters,
    legalParameterSources,
    appConfig,
    surcharges: [
      { id: 'night', name: 'Nocturnidad genérica', type: 'nocturnidad', surchargeType: 'percentage', value: 99 },
      { id: 'sunday', name: 'Domingo genérico', type: 'domingo', surchargeType: 'percentage', value: 99 },
      { id: 'weekend', name: 'Fin de semana genérico', type: 'fin_de_semana', surchargeType: 'percentage', value: 99 },
    ],
  };
}

describe('Adaptador territorial al motor económico', () => {
  it.each([8, 12, 24])('acepta un turno dominical de %s horas sin doble plus de fin de semana', (hours) => {
    const profile = CONVENTION_PROFILES.madrid;
    const built = buildCostingInputFromDatabase({
      block: { ...block, hoursPerDay: hours }, schedule: schedule(hours),
      category: { id: 'nurse-id', name: 'Enfermero', defaultInternalCost: 14 },
      config: configFor('madrid', {
        PLUS_NOCTURNIDAD_MADRID: 25, SIN_PLUS_DOMINGO_MADRID: 0,
        SIN_PLUS_SABADO_MADRID: 0, PLUS_FESTIVO_MADRID: 12,
        PLUS_FESTIVO_ESPECIAL_MADRID: 38,
      }),
      serviceId: '0', location: { province: 'Madrid', municipality: 'Madrid', conventionProfile: profile },
    });
    expect(built.status).toBe('ready');
    if (built.status !== 'ready') return;
    expect(built.input.hours.breakdown.weekend).toBe(0);
    expect(built.input.plusRules.find((rule) => rule.hourBucket === 'night')?.value).toBe(25);
    expect(built.input.plusRules.find((rule) => rule.hourBucket === 'sunday')?.value).toBe(0);
    expect(calculateCosting(built.input).status).toBe('calculated');
  });

  it('sustituye los recargos genéricos por el convenio provincial de Burgos', () => {
    const profile = CONVENTION_PROFILES.burgos_extension;
    const built = buildCostingInputFromDatabase({
      block, schedule: schedule(8), category: { id: 'nurse-id', name: 'Enfermero', defaultInternalCost: 14 },
      config: configFor('burgos_extension', {
        PLUS_NOCTURNIDAD_BURGOS: 25, PLUS_DOMINGO_BURGOS: 21.74,
        SIN_PLUS_SABADO_BURGOS: 0, PLUS_FESTIVO_BURGOS: 38.70,
      }),
      serviceId: '0', location: { province: 'Burgos', municipality: 'Burgos', conventionProfile: profile },
    });
    expect(built.status).toBe('ready');
    if (built.status !== 'ready') return;
    expect(built.input.plusRules.find((rule) => rule.hourBucket === 'sunday')?.value).toBe(21.74);
    expect(built.input.plusRules.find((rule) => rule.hourBucket === 'night')?.source?.id).toBe('conv_burgos_extension');
  });

  it('añade solo la diferencia del festivo especial cuando el festivo ordinario ya está incluido', () => {
    const profile = CONVENTION_PROFILES.madrid;
    const holidaySchedule = schedule(8, '2026-12-25');
    holidaySchedule.shiftBreakdown = { ...holidaySchedule.shiftBreakdown, sunday: 0, weekend: 0, holiday: 8, holidayNational: 8 };
    const built = buildCostingInputFromDatabase({
      block: { ...block, specificDates: ['2026-12-25'], shiftType: 'morning' }, schedule: holidaySchedule,
      category: { id: 'nurse-id', name: 'Enfermero', defaultInternalCost: 14 },
      config: configFor('madrid', {
        PLUS_NOCTURNIDAD_MADRID: 25, SIN_PLUS_DOMINGO_MADRID: 0,
        SIN_PLUS_SABADO_MADRID: 0, PLUS_FESTIVO_MADRID: 12,
        PLUS_FESTIVO_ESPECIAL_MADRID: 38,
      }),
      serviceId: '0', location: { province: 'Madrid', municipality: 'Madrid', conventionProfile: profile },
    });
    expect(built.status).toBe('ready');
    if (built.status !== 'ready') return;
    const special = built.input.plusRules.find((rule) => rule.name.includes('25 de diciembre'));
    expect(special?.value).toBe(26);
    expect(special?.units).toBe(1);
  });

  it('bloquea si falta la fuente verificable de un parámetro territorial usado', () => {
    const profile = CONVENTION_PROFILES.madrid;
    const config = configFor('madrid', { PLUS_NOCTURNIDAD_MADRID: 25, SIN_PLUS_DOMINGO_MADRID: 0 });
    delete config.legalParameterSources.PLUS_NOCTURNIDAD_MADRID;
    const built = buildCostingInputFromDatabase({
      block, schedule: schedule(8), category: { id: 'nurse-id', name: 'Enfermero', defaultInternalCost: 14 },
      config, serviceId: '0', location: { province: 'Madrid', conventionProfile: profile },
    });
    expect(built.status).toBe('pending_configuration');
  });

  it('no inventa overhead, margen, comisión ni umbrales cuando faltan', () => {
    const profile = CONVENTION_PROFILES.madrid;
    const config = configFor('madrid', {
      PLUS_NOCTURNIDAD_MADRID: 25, SIN_PLUS_DOMINGO_MADRID: 0,
      SIN_PLUS_SABADO_MADRID: 0, PLUS_FESTIVO_MADRID: 12,
      PLUS_FESTIVO_ESPECIAL_MADRID: 38,
    });
    for (const key of Object.keys(syntheticInternalEconomics)) delete config.appConfig[key];

    const built = buildCostingInputFromDatabase({
      block, schedule: schedule(8), category: { id: 'nurse-id', name: 'Enfermero', defaultInternalCost: 14 },
      config, serviceId: '0', location: { province: 'Madrid', conventionProfile: profile },
    });

    expect(built.status).toBe('pending_configuration');
    if (built.status !== 'pending_configuration') return;
    expect(built.issues.some((issue) => issue.field === 'appConfig.costing_overhead_percent')).toBe(true);
    expect(built.issues.some((issue) => issue.field === 'appConfig.commercial_gasi_markup_on_cost_percent')).toBe(true);
    expect(built.issues.some((issue) => issue.field === 'appConfig.commercial_commission_list_percent')).toBe(true);
  });

  it('transporta exactamente la configuración interna sintética al snapshot del motor', () => {
    const profile = CONVENTION_PROFILES.madrid;
    const built = buildCostingInputFromDatabase({
      block, schedule: schedule(8), category: { id: 'nurse-id', name: 'Enfermero', defaultInternalCost: 14 },
      config: configFor('madrid', {
        PLUS_NOCTURNIDAD_MADRID: 25, SIN_PLUS_DOMINGO_MADRID: 0,
        SIN_PLUS_SABADO_MADRID: 0, PLUS_FESTIVO_MADRID: 12,
        PLUS_FESTIVO_ESPECIAL_MADRID: 38,
      }),
      serviceId: '0', location: { province: 'Madrid', conventionProfile: profile },
    });

    expect(built.status).toBe('ready');
    if (built.status !== 'ready') return;
    expect(built.input.overhead.percentageOnExpandedLabor).toBe(7.25);
    expect(built.input.contract.terminationProvisionPercent).toBe(2.5);
    expect(built.input.commercialPolicy).toEqual({
      gasiMarkupOnCostPercent: 31,
      commercialFloorOnCostPercent: 9,
      commercialBufferOnCostPercent: 6,
      commissionAtFloorPercent: 8,
      commissionIntermediatePercent: 9,
      commissionAtListPercent: 10,
      semaphoreTargetReturnOnCostPercent: 28,
      semaphoreReviewReturnOnCostPercent: 18,
    });
  });
});
