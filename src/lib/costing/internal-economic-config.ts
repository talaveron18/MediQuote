import type { CommercialPolicy, ContractType, DataIssue } from './cost-types';

export interface InternalEconomicFieldDefinition {
  key: string;
  label: string;
  description: string;
  unit: '%' | '€';
}

export const INTERNAL_ECONOMIC_FIELDS: ReadonlyArray<InternalEconomicFieldDefinition> = Object.freeze([
  {
    key: 'costing_overhead_percent',
    label: 'Overhead GASI sobre coste laboral ampliado',
    description: 'Coste interno de estructura de GASI. No se contrasta con la gestoría.',
    unit: '%',
  },
  {
    key: 'costing_termination_provision_percent_temp',
    label: 'Provisión interna por finalización de contrato temporal',
    description: 'Parámetro interno aplicable solo a contratos temporales. Debe configurarse expresamente.',
    unit: '%',
  },
  {
    key: 'commercial_gasi_markup_on_cost_percent',
    label: 'Imputación / retorno objetivo GASI sobre coste',
    description: 'Porcentaje interno usado para construir el rango comercial. No procede de gestoría.',
    unit: '%',
  },
  {
    key: 'commercial_floor_on_cost_percent',
    label: 'Margen comercial mínimo sobre coste',
    description: 'Componente interno del precio mínimo ordinario.',
    unit: '%',
  },
  {
    key: 'commercial_buffer_on_cost_percent',
    label: 'Colchón comercial sobre coste',
    description: 'Margen negociable interno entre precio mínimo y precio inicial.',
    unit: '%',
  },
  {
    key: 'commercial_commission_floor_percent',
    label: 'Comisión comercial en precio mínimo',
    description: 'Porcentaje de comisión cuando se cierra en el mínimo ordinario.',
    unit: '%',
  },
  {
    key: 'commercial_commission_intermediate_percent',
    label: 'Comisión comercial intermedia',
    description: 'Porcentaje de comisión para cierres entre mínimo y precio inicial.',
    unit: '%',
  },
  {
    key: 'commercial_commission_list_percent',
    label: 'Comisión comercial en precio inicial',
    description: 'Porcentaje de comisión cuando se cierra al precio inicial.',
    unit: '%',
  },
  {
    key: 'commercial_semaphore_green_return_on_cost_percent',
    label: 'Umbral verde de retorno GASI sobre coste',
    description: 'Umbral interno de semáforo económico para resultado verde.',
    unit: '%',
  },
  {
    key: 'commercial_semaphore_yellow_return_on_cost_percent',
    label: 'Umbral amarillo de retorno GASI sobre coste',
    description: 'Umbral interno de semáforo económico para resultado amarillo.',
    unit: '%',
  },
]);

export interface InternalEconomicConfiguration {
  overheadPercent: number;
  terminationProvisionPercent: number;
  commercialPolicy: CommercialPolicy;
}

export type InternalEconomicConfigurationResult =
  | { status: 'ready'; value: InternalEconomicConfiguration }
  | { status: 'pending_configuration'; issues: DataIssue[] };

function readNonNegativePercentage(
  appConfig: Record<string, string>,
  key: string,
  label: string,
  issues: DataIssue[],
): number {
  const raw = appConfig[key];
  if (raw === undefined || raw === null || raw.trim() === '') {
    issues.push({
      field: `appConfig.${key}`,
      kind: 'missing',
      message: `Falta configurar «${label}».`,
    });
    return Number.NaN;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    issues.push({
      field: `appConfig.${key}`,
      kind: 'invalid',
      message: `«${label}» debe ser un porcentaje numérico igual o mayor que 0.`,
    });
    return Number.NaN;
  }
  return value;
}

export function readInternalEconomicConfiguration(
  appConfig: Record<string, string>,
  contractType: ContractType,
): InternalEconomicConfigurationResult {
  const issues: DataIssue[] = [];
  const field = (key: string) => INTERNAL_ECONOMIC_FIELDS.find((item) => item.key === key)!;
  const read = (key: string) => readNonNegativePercentage(appConfig, key, field(key).label, issues);

  const overheadPercent = read('costing_overhead_percent');
  const terminationProvisionPercent = contractType === 'temporal'
    ? read('costing_termination_provision_percent_temp')
    : 0;

  const commercialPolicy: CommercialPolicy = {
    gasiMarkupOnCostPercent: read('commercial_gasi_markup_on_cost_percent'),
    commercialFloorOnCostPercent: read('commercial_floor_on_cost_percent'),
    commercialBufferOnCostPercent: read('commercial_buffer_on_cost_percent'),
    commissionAtFloorPercent: read('commercial_commission_floor_percent'),
    commissionIntermediatePercent: read('commercial_commission_intermediate_percent'),
    commissionAtListPercent: read('commercial_commission_list_percent'),
    semaphoreTargetReturnOnCostPercent: read('commercial_semaphore_green_return_on_cost_percent'),
    semaphoreReviewReturnOnCostPercent: read('commercial_semaphore_yellow_return_on_cost_percent'),
  };

  if (
    Number.isFinite(commercialPolicy.semaphoreTargetReturnOnCostPercent)
    && Number.isFinite(commercialPolicy.semaphoreReviewReturnOnCostPercent)
    && commercialPolicy.semaphoreTargetReturnOnCostPercent < commercialPolicy.semaphoreReviewReturnOnCostPercent
  ) {
    issues.push({
      field: 'appConfig.commercial_semaphore_green_return_on_cost_percent',
      kind: 'invalid',
      message: 'El umbral verde no puede ser inferior al umbral amarillo.',
    });
  }

  if (issues.length > 0) return { status: 'pending_configuration', issues };

  return {
    status: 'ready',
    value: {
      overheadPercent,
      terminationProvisionPercent,
      commercialPolicy,
    },
  };
}
