import type { BlockCalculationResult, HolidayInfo, ServiceBlockInput, SurchargeKind, SurchargeType } from '../types';
import { adaptBlockResultToCostHours } from './cost-hours-adapter';
import { readInternalEconomicConfiguration } from './internal-economic-config';
import type {
  CostSourceRef,
  CostingInput,
  DataIssue,
  LaborPlusRule,
  PlusHourBucket,
} from './cost-types';
import type { ConventionProfile } from '../service-locations';
import {
  VERIFIED_LABOR_INPUTS_KEY,
  parseVerifiedLaborInputStore,
  resolveVerifiedLaborInputForDates,
  type VerifiedLaborConcept,
  type VerifiedLaborInputRecord,
} from './verified-labor-inputs';

interface CategoryCostSource {
  id: string;
  name: string;
  defaultInternalCost?: number | null;
}

interface SurchargeCostSource {
  id: string;
  name: string;
  type: string;
  surchargeType: string;
  value: number;
}

export interface CostingDatabaseConfig {
  legalParameters: Record<string, number>;
  legalParameterSources?: Record<string, CostSourceRef>;
  appConfig: Record<string, string>;
  surcharges: SurchargeCostSource[];
}

export type CostingInputBuildResult =
  | { status: 'ready'; input: CostingInput; laborSources: CostSourceRef[] }
  | { status: 'pending_configuration'; issues: DataIssue[] };

const finite = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function source(id: string, label: string) {
  return { id, label, status: 'verified' as const };
}

const PLUS_BUCKETS: Partial<Record<SurchargeType, PlusHourBucket>> = {
  nocturnidad: 'night',
  domingo: 'sunday',
  fin_de_semana: 'weekend',
  festivo: 'holiday',
  festivo_nacional: 'holidayNational',
  festivo_autonomico: 'holidayAutonomico',
  festivo_provincial: 'holidayProvincial',
  festivo_municipal: 'holidayMunicipal',
};

function buildPlusRules(
  rows: SurchargeCostSource[],
  territorialRules: Array<{
    bucket: PlusHourBucket;
    formula: LaborPlusRule['formula'];
    value: number;
    units?: number;
    source: CostSourceRef;
    key: string;
    label?: string;
  }> = [],
): LaborPlusRule[] {
  const selected = new Map<PlusHourBucket, SurchargeCostSource>();
  for (const row of rows) {
    const bucket = PLUS_BUCKETS[row.type as SurchargeType];
    if (bucket && !selected.has(bucket)) selected.set(bucket, row);
  }
  if (
    selected.has('holidayNational') || selected.has('holidayAutonomico')
    || selected.has('holidayProvincial') || selected.has('holidayMunicipal')
  ) {
    selected.delete('holiday');
  }
  for (const rule of territorialRules) selected.delete(rule.bucket);

  const genericRules = [...selected.entries()].flatMap(([bucket, row]) => {
    const kind = row.surchargeType as SurchargeKind;
    if (kind !== 'percentage' && kind !== 'fixed') return [];
    return [{
      id: row.id,
      name: row.name,
      formula: kind === 'percentage' ? 'percentage_base_hour' : 'per_hour',
      value: row.value,
      hourBucket: bucket,
      source: source(`surcharge:${row.id}`, `Configuración GASI: ${row.name}`),
    } satisfies LaborPlusRule];
  });

  return [...genericRules, ...territorialRules.map((rule) => ({
    id: `territorial:${rule.key}:${rule.bucket}`,
    name: rule.label || `Convenio territorial · ${rule.bucket}`,
    formula: rule.formula,
    value: rule.value,
    hourBucket: rule.bucket,
    units: rule.units,
    source: rule.source,
  } satisfies LaborPlusRule))];
}

function requiredNumber(issues: DataIssue[], values: Record<string, number>, key: string): number {
  const value = finite(values[key]);
  if (value === undefined) {
    issues.push({ field: `legalParameters.${key}`, kind: 'missing', message: `Falta el parámetro legal ${key}.` });
    return Number.NaN;
  }
  return value;
}

function combinedSource(label: string, sources: CostSourceRef[]): CostSourceRef {
  const ids = sources.map((item) => item.id).sort();
  const from = sources.map((item) => item.effectiveFrom).filter(Boolean).sort().at(-1);
  const toValues = sources.map((item) => item.effectiveTo).filter(Boolean).sort();
  return {
    id: ids.join('+'),
    label,
    effectiveFrom: from,
    effectiveTo: toValues.length ? toValues[0] : undefined,
    status: 'verified',
  };
}

export function buildCostingInputFromDatabase(params: {
  block: ServiceBlockInput;
  schedule: BlockCalculationResult;
  category: CategoryCostSource | undefined;
  config: CostingDatabaseConfig;
  serviceId: string;
  holidays?: HolidayInfo[];
  location?: {
    province?: string;
    municipality?: string;
    conventionProfile?: ConventionProfile;
  };
}): CostingInputBuildResult {
  const { block, schedule, category, config, serviceId, holidays = [], location } = params;
  const issues: DataIssue[] = [];

  if (!category) {
    issues.push({
      field: `blocks.${serviceId}.professionalCategory`,
      kind: 'missing',
      message: 'La categoría profesional no existe o está desactivada.',
    });
  }
  if (!block.contractType) {
    issues.push({
      field: `blocks.${serviceId}.contractType`,
      kind: 'missing',
      message: 'Falta seleccionar el tipo de contratación.',
    });
  }

  const conventionProfile = location?.conventionProfile;
  if (!conventionProfile) {
    issues.push({
      field: `location.${location?.province ?? 'province'}.conventionProfile`,
      kind: 'missing',
      message: `No existe un perfil de convenio configurado para ${location?.province ?? 'la provincia'}.`,
    });
  }
  const province = location?.province?.trim() || config.appConfig.costing_province?.trim();
  if (!province) {
    issues.push({
      field: 'appConfig.costing_province',
      kind: 'missing',
      message: 'Falta la provincia/convenio de costes.',
    });
  }

  const internalEconomic = block.contractType
    ? readInternalEconomicConfiguration(config.appConfig, block.contractType)
    : null;
  if (internalEconomic?.status === 'pending_configuration') issues.push(...internalEconomic.issues);

  const verifiedRecords = parseVerifiedLaborInputStore(config.appConfig[VERIFIED_LABOR_INPUTS_KEY]);
  const serviceDates = schedule.workingDates;
  const resolved = new Map<VerifiedLaborConcept, ReturnType<typeof resolveVerifiedLaborInputForDates>>();
  const laborSources: CostSourceRef[] = [];

  const resolveLabor = (conceptKey: VerifiedLaborConcept) => {
    if (!category || !block.contractType || !province) return undefined;
    const result = resolveVerifiedLaborInputForDates({
      records: verifiedRecords,
      conceptKey,
      categoryId: category.id,
      territory: province,
      contractType: block.contractType,
      serviceDates,
    });
    resolved.set(conceptKey, result);
    if (result.status === 'pending_configuration') {
      issues.push(...result.issues);
      return undefined;
    }
    laborSources.push(result.source);
    return result.value;
  };

  const productiveHourlyGross = resolveLabor('productive_hour_gross');
  const annualConventionHours = resolveLabor('annual_convention_hours');
  const annualProductiveHours = resolveLabor('annual_productive_hours');
  const isMercantile = block.contractType === 'mercantil_autonomo';
  const managementFee = isMercantile ? 0 : resolveLabor('management_fee_per_contract');
  const commonContingencies = isMercantile ? 0 : resolveLabor('ss_common_contingencies_percent');
  const unemployment = isMercantile ? 0 : resolveLabor('ss_unemployment_percent');
  const fogasa = isMercantile ? 0 : resolveLabor('ss_fogasa_percent');
  const training = isMercantile ? 0 : resolveLabor('ss_training_percent');
  const mei = isMercantile ? 0 : resolveLabor('ss_mei_percent');
  const atep = isMercantile ? 0 : resolveLabor('atep_percent');

  const smiAnnual = requiredNumber(issues, config.legalParameters, 'SMI_ANNUAL_2026');

  const hours = adaptBlockResultToCostHours(schedule);
  const averageShiftHours = hours.shifts > 0 ? hours.coverageHours / hours.shifts : 8;
  const positions = Math.max(1, Number(block.puestosSimultaneos ?? 1));
  const holidayTypesByBucket: Partial<Record<PlusHourBucket, HolidayInfo['type']>> = {
    holidayNational: 'nacional',
    holidayAutonomico: 'autonomico',
    holidayProvincial: 'provincial',
    holidayMunicipal: 'municipal',
  };
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const territorialRules: Parameters<typeof buildPlusRules>[1] = [];

  for (const rule of conventionProfile?.plusRules ?? []) {
    const applicableHours = hours.breakdown[rule.bucket];
    if (applicableHours <= 0) continue;
    const value = finite(config.legalParameters[rule.legalParameterKey]);
    const ruleSource = config.legalParameterSources?.[rule.legalParameterKey];
    if (value === undefined) {
      issues.push({
        field: `legalParameters.${rule.legalParameterKey}`,
        kind: 'missing',
        message: `Falta el parámetro del convenio ${rule.legalParameterKey} para ${location?.province}.`,
      });
      continue;
    }
    if (!ruleSource) {
      issues.push({
        field: `legalParameters.${rule.legalParameterKey}.source`,
        kind: 'missing',
        message: `Falta la fuente oficial trazable de ${rule.legalParameterKey}.`,
      });
      continue;
    }
    let units: number | undefined;
    if (rule.formula === 'per_shift') {
      const holidayType = holidayTypesByBucket[rule.bucket];
      if (holidayType) {
        const matchingDates = new Set(holidays.filter((holiday) => holiday.type === holidayType).map((holiday) => holiday.date));
        units = schedule.workingDates.filter((date) => matchingDates.has(date)).length * positions;
      } else if (rule.bucket === 'sunday') {
        units = schedule.workingDates.filter((date) => (
          new Date(`${date}T00:00:00Z`).getUTCDay() === 0 && !holidayDates.has(date)
        )).length * positions;
      } else {
        units = applicableHours / (rule.unitHours ?? averageShiftHours);
      }
    }
    territorialRules.push({
      bucket: rule.bucket,
      formula: rule.formula,
      value,
      units,
      source: ruleSource,
      key: rule.legalParameterKey,
      label: rule.label,
    });
  }

  for (const rule of conventionProfile?.specialPlusRules ?? []) {
    if (rule.shiftTypes && !rule.shiftTypes.includes(block.shiftType)) continue;
    const matchingDates = schedule.workingDates.filter((date) => rule.monthDays.includes(date.slice(5)));
    if (matchingDates.length === 0) continue;
    const specialValue = finite(config.legalParameters[rule.legalParameterKey]);
    const baseValue = rule.baseLegalParameterKey ? finite(config.legalParameters[rule.baseLegalParameterKey]) : 0;
    const ruleSource = config.legalParameterSources?.[rule.legalParameterKey];
    if (specialValue === undefined || baseValue === undefined) {
      issues.push({
        field: `legalParameters.${rule.legalParameterKey}`,
        kind: 'missing',
        message: `Falta el importe de festivo especial ${rule.legalParameterKey} para ${location?.province}.`,
      });
      continue;
    }
    if (!ruleSource) {
      issues.push({
        field: `legalParameters.${rule.legalParameterKey}.source`,
        kind: 'missing',
        message: `Falta la fuente oficial trazable de ${rule.legalParameterKey}.`,
      });
      continue;
    }
    const incrementalValue = specialValue - baseValue;
    if (incrementalValue < 0) {
      issues.push({
        field: `legalParameters.${rule.legalParameterKey}`,
        kind: 'invalid',
        message: `${rule.legalParameterKey} no puede ser inferior al plus ordinario que sustituye.`,
      });
      continue;
    }
    territorialRules.push({
      bucket: 'total',
      formula: 'per_shift',
      value: incrementalValue,
      units: matchingDates.length * Math.max(1, block.puestosSimultaneos),
      source: ruleSource,
      key: `${rule.legalParameterKey}:especial`,
      label: rule.label,
    });
  }

  const plusRules = buildPlusRules(config.surcharges, territorialRules);
  const uncoveredBuckets: Array<[PlusHourBucket, number]> = [
    ['night', hours.breakdown.night],
    ['sunday', hours.breakdown.sunday],
    ['weekend', hours.breakdown.weekend],
    ['holidayNational', hours.breakdown.holidayNational],
    ['holidayAutonomico', hours.breakdown.holidayAutonomico],
    ['holidayProvincial', hours.breakdown.holidayProvincial],
    ['holidayMunicipal', hours.breakdown.holidayMunicipal],
  ];
  for (const [bucket, applicableHours] of uncoveredBuckets) {
    if (applicableHours > 0 && !plusRules.some((rule) => rule.hourBucket === bucket)) {
      issues.push({ field: `surcharges.${bucket}`, kind: 'missing', message: `Falta una regla de coste verificada para ${bucket}.` });
    }
  }

  if (
    issues.length > 0 || !internalEconomic || internalEconomic.status !== 'ready'
    || productiveHourlyGross === undefined || annualConventionHours === undefined
    || annualProductiveHours === undefined || managementFee === undefined
    || commonContingencies === undefined || unemployment === undefined || fogasa === undefined
    || training === undefined || mei === undefined || atep === undefined
  ) {
    return { status: 'pending_configuration', issues };
  }

  const annualGross = productiveHourlyGross * annualProductiveHours;
  const monthlyEquivalent = annualGross / 14;
  const salarySource = resolved.get('productive_hour_gross');
  const contributionSources = [
    'ss_common_contingencies_percent', 'ss_unemployment_percent', 'ss_fogasa_percent',
    'ss_training_percent', 'ss_mei_percent',
  ].flatMap((key) => {
    const item = resolved.get(key as VerifiedLaborConcept);
    return item?.status === 'ready' ? [item.source] : [];
  });
  const atepSource = resolved.get('atep_percent');

  return {
    status: 'ready',
    laborSources,
    input: {
      serviceId,
      professionalProfile: category!.name,
      province: province!,
      municipality: location?.municipality,
      hours,
      salary: {
        annualOrdinaryBaseSalary: monthlyEquivalent * 12,
        extraPay: { paymentsPerYear: 2, amountPerPayment: monthlyEquivalent, paymentMode: 'prorated' },
        annualFixedSupplements: 0,
        annualOtherSalaryItems: 0,
        annualConventionHours,
        annualProductiveHours,
        smiAnnual,
        source: salarySource?.status === 'ready' ? salarySource.source : undefined,
      },
      plusRules,
      employerContributions: {
        commonContingenciesPercent: commonContingencies,
        unemploymentPercent: unemployment,
        fogasaPercent: fogasa,
        vocationalTrainingPercent: training,
        meiPercent: mei,
        otherPercent: 0,
        source: isMercantile || contributionSources.length === 0
          ? undefined
          : combinedSource('Gestoría: cotizaciones empresariales verificadas', contributionSources),
      },
      occupationalRisk: {
        temporaryDisabilityPercent: atep,
        disabilityDeathSurvivorPercent: 0,
        source: atepSource?.status === 'ready' ? atepSource.source : undefined,
      },
      contract: {
        contractType: block.contractType!,
        laborContracts: isMercantile ? 0 : Math.max(1, schedule.plantillaSeleccionada),
        managementFeePerLaborContract: managementFee,
        terminationProvisionPercent: internalEconomic.value.terminationProvisionPercent,
        otherFixedContractCosts: 0,
      },
      overhead: { percentageOnExpandedLabor: internalEconomic.value.overheadPercent, fixedAmount: 0 },
      directCosts: [],
      commercialPolicy: { ...internalEconomic.value.commercialPolicy },
    },
  };
}
