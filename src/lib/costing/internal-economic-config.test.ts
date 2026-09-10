import { describe, expect, it } from 'vitest';
import { readInternalEconomicConfiguration } from './internal-economic-config';

const COMPLETE_SYNTHETIC_CONFIG: Record<string, string> = {
  costing_overhead_percent: '7.25',
  costing_termination_provision_percent_temp: '3',
  commercial_gasi_markup_on_cost_percent: '11',
  commercial_floor_on_cost_percent: '5',
  commercial_buffer_on_cost_percent: '4',
  commercial_commission_floor_percent: '2',
  commercial_commission_intermediate_percent: '3',
  commercial_commission_list_percent: '4',
  commercial_semaphore_green_return_on_cost_percent: '12',
  commercial_semaphore_yellow_return_on_cost_percent: '8',
};

describe('configuración económica interna', () => {
  it('bloquea el cálculo cuando faltan parámetros internos explícitos', () => {
    const result = readInternalEconomicConfiguration({}, 'indefinido');

    expect(result.status).toBe('pending_configuration');
    if (result.status !== 'pending_configuration') return;
    expect(result.issues.map((issue) => issue.field)).toContain('appConfig.costing_overhead_percent');
    expect(result.issues.map((issue) => issue.field)).toContain('appConfig.commercial_gasi_markup_on_cost_percent');
    expect(result.issues.map((issue) => issue.field)).toContain('appConfig.commercial_commission_list_percent');
  });

  it('no exige provisión temporal para un contrato indefinido', () => {
    const config = { ...COMPLETE_SYNTHETIC_CONFIG };
    delete config.costing_termination_provision_percent_temp;

    const result = readInternalEconomicConfiguration(config, 'indefinido');

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.value.terminationProvisionPercent).toBe(0);
  });

  it('sí exige provisión temporal cuando el contrato es temporal', () => {
    const config = { ...COMPLETE_SYNTHETIC_CONFIG };
    delete config.costing_termination_provision_percent_temp;

    const result = readInternalEconomicConfiguration(config, 'temporal');

    expect(result.status).toBe('pending_configuration');
    if (result.status !== 'pending_configuration') return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'appConfig.costing_termination_provision_percent_temp',
        kind: 'missing',
      }),
    ]));
  });

  it('rechaza un umbral verde inferior al amarillo', () => {
    const result = readInternalEconomicConfiguration({
      ...COMPLETE_SYNTHETIC_CONFIG,
      commercial_semaphore_green_return_on_cost_percent: '7',
      commercial_semaphore_yellow_return_on_cost_percent: '8',
    }, 'indefinido');

    expect(result.status).toBe('pending_configuration');
    if (result.status !== 'pending_configuration') return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'appConfig.commercial_semaphore_green_return_on_cost_percent',
        kind: 'invalid',
      }),
    ]));
  });

  it('devuelve exactamente los valores configurados sin sustituirlos por defaults', () => {
    const result = readInternalEconomicConfiguration(COMPLETE_SYNTHETIC_CONFIG, 'temporal');

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.value.overheadPercent).toBe(7.25);
    expect(result.value.terminationProvisionPercent).toBe(3);
    expect(result.value.commercialPolicy).toEqual({
      gasiMarkupOnCostPercent: 11,
      commercialFloorOnCostPercent: 5,
      commercialBufferOnCostPercent: 4,
      commissionAtFloorPercent: 2,
      commissionIntermediatePercent: 3,
      commissionAtListPercent: 4,
      semaphoreTargetReturnOnCostPercent: 12,
      semaphoreReviewReturnOnCostPercent: 8,
    });
  });
});
