import { calculateCommercialResult, calculatePriceRange } from './commercial-policy';
import type {
  CalculatedCostingResult,
  CommercialPolicy,
  CommercialProjection,
  CostSourceRef,
  CostingInput,
  CostingResult,
  CostLineResult,
  DataIssue,
  EmployerContributionConfig,
  InternalCostBreakdown,
  LaborCostBreakdown,
  LaborPlusRule,
  OccupationalRiskConfig,
} from './cost-types';
import { COST_ENGINE_VERSION } from './cost-types';

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const roundRate = (value: number): number => Math.round((value + Number.EPSILON) * 10_000) / 10_000;

function requireFinite(
  issues: DataIssue[],
  field: string,
  value: unknown,
  options: { positive?: boolean; integer?: boolean } = {},
): void {
  if (value === undefined || value === null || value === '') {
    issues.push({ field, kind: 'missing', message: `Falta configurar ${field}.` });
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ field, kind: 'invalid', message: `${field} debe ser un número finito.` });
    return;
  }
  if (options.positive ? value <= 0 : value < 0) {
    issues.push({
      field,
      kind: 'invalid',
      message: `${field} debe ser ${options.positive ? 'mayor que cero' : 'igual o mayor que cero'}.`,
    });
  }
  if (options.integer && !Number.isInteger(value)) {
    issues.push({ field, kind: 'invalid', message: `${field} debe ser un número entero.` });
  }
}

function validateSource(
  issues: DataIssue[],
  field: string,
  source: CostSourceRef | undefined,
): void {
  if (!source) {
    issues.push({
      field,
      kind: 'missing',
      message: `${field} necesita una fuente y vigencia identificadas.`,
    });
    return;
  }
  if (!source.id?.trim() || !source.label?.trim()) {
    issues.push({
      field,
      kind: 'invalid',
      message: `${field} necesita identificador y descripción de fuente.`,
    });
  }
  if (source.status !== 'verified') {
    issues.push({
      field,
      kind: 'blocked',
      message: `${field} no está verificado y no puede utilizarse para cerrar el cálculo.`,
    });
  }
}

function validatePolicy(issues: DataIssue[], policy: CommercialPolicy | undefined): void {
  if (!policy) {
    issues.push({
      field: 'commercialPolicy',
      kind: 'missing',
      message: 'Falta configurar la política comercial.',
    });
    return;
  }
  for (const [key, value] of Object.entries(policy)) {
    requireFinite(issues, `commercialPolicy.${key}`, value);
  }
  if (
    Number.isFinite(policy.semaphoreReviewReturnOnCostPercent)
    && Number.isFinite(policy.semaphoreTargetReturnOnCostPercent)
    && policy.semaphoreReviewReturnOnCostPercent > policy.semaphoreTargetReturnOnCostPercent
  ) {
    issues.push({
      field: 'commercialPolicy.semaphoreReviewReturnOnCostPercent',
      kind: 'invalid',
      message: 'El umbral de revisión no puede superar el objetivo.',
    });
  }
  if (
    policy.commissionAtFloorPercent > policy.commissionIntermediatePercent
    || policy.commissionIntermediatePercent > policy.commissionAtListPercent
  ) {
    issues.push({
      field: 'commercialPolicy.commissionIntermediatePercent',
      kind: 'invalid',
      message: 'Los tramos de comisión deben avanzar de suelo a intermedio y máximo.',
    });
  }
}

export function validateCostingInput(input: CostingInput): DataIssue[] {
  const issues: DataIssue[] = [];

  if (!input.professionalProfile?.trim()) {
    issues.push({ field: 'professionalProfile', kind: 'missing', message: 'Falta el perfil profesional.' });
  }
  if (!input.province?.trim()) {
    issues.push({ field: 'province', kind: 'missing', message: 'Falta la provincia.' });
  }

  requireFinite(issues, 'hours.coverageHours', input.hours?.coverageHours, { positive: true });
  requireFinite(issues, 'hours.workingDays', input.hours?.workingDays, { positive: true });
  requireFinite(issues, 'hours.shifts', input.hours?.shifts, { positive: true });
  const hourBuckets = [
    'total', 'regular', 'night', 'sunday', 'holiday', 'holidayNational',
    'holidayAutonomico', 'holidayProvincial', 'holidayMunicipal', 'weekend',
  ] as const;
  for (const bucket of hourBuckets) {
    requireFinite(issues, `hours.breakdown.${bucket}`, input.hours?.breakdown?.[bucket]);
  }
  if (
    Number.isFinite(input.hours?.coverageHours)
    && Number.isFinite(input.hours?.breakdown?.total)
    && Math.abs(input.hours.coverageHours - input.hours.breakdown.total) > 0.01
  ) {
    issues.push({
      field: 'hours.breakdown.total',
      kind: 'invalid',
      message: 'El total del desglose horario debe coincidir con las horas de cobertura.',
    });
  }
  if (
    Number.isFinite(input.hours?.breakdown?.regular)
    && Number.isFinite(input.hours?.breakdown?.night)
    && Number.isFinite(input.hours?.breakdown?.total)
    && Math.abs(
      input.hours.breakdown.regular
      + input.hours.breakdown.night
      - input.hours.breakdown.total
    ) > 0.01
  ) {
    issues.push({
      field: 'hours.breakdown.regular',
      kind: 'invalid',
      message: 'Las horas ordinarias y nocturnas deben reconstruir el total de cobertura.',
    });
  }

  requireFinite(issues, 'salary.annualOrdinaryBaseSalary', input.salary?.annualOrdinaryBaseSalary);
  requireFinite(issues, 'salary.extraPay.paymentsPerYear', input.salary?.extraPay?.paymentsPerYear, { integer: true });
  requireFinite(issues, 'salary.extraPay.amountPerPayment', input.salary?.extraPay?.amountPerPayment);
  if (!input.salary?.extraPay?.paymentMode) {
    issues.push({
      field: 'salary.extraPay.paymentMode',
      kind: 'missing',
      message: 'Falta indicar si las pagas extra se abonan prorrateadas o separadas.',
    });
  } else if (!['prorated', 'separate'].includes(input.salary.extraPay.paymentMode)) {
    issues.push({
      field: 'salary.extraPay.paymentMode',
      kind: 'invalid',
      message: 'La modalidad de pagas extra debe ser prorrateada o separada.',
    });
  }
  requireFinite(issues, 'salary.annualFixedSupplements', input.salary?.annualFixedSupplements);
  requireFinite(issues, 'salary.annualOtherSalaryItems', input.salary?.annualOtherSalaryItems);
  requireFinite(issues, 'salary.annualConventionHours', input.salary?.annualConventionHours, { positive: true });
  requireFinite(issues, 'salary.annualProductiveHours', input.salary?.annualProductiveHours, { positive: true });
  requireFinite(issues, 'salary.smiAnnual', input.salary?.smiAnnual, { positive: true });
  if (
    Number.isFinite(input.salary?.annualConventionHours)
    && Number.isFinite(input.salary?.annualProductiveHours)
    && input.salary.annualProductiveHours > input.salary.annualConventionHours
  ) {
    issues.push({
      field: 'salary.annualProductiveHours',
      kind: 'invalid',
      message: 'Las horas productivas no pueden superar la jornada anual de convenio.',
    });
  }
  validateSource(issues, 'salary.source', input.salary?.source);

  for (const [index, plus] of (input.plusRules || []).entries()) {
    if (!plus.id) issues.push({ field: `plusRules.${index}.id`, kind: 'missing', message: 'Falta el identificador del plus.' });
    if (!plus.name) issues.push({ field: `plusRules.${index}.name`, kind: 'missing', message: 'Falta el nombre del plus.' });
    requireFinite(issues, `plusRules.${index}.value`, plus.value);
    if ((plus.formula === 'per_hour' || plus.formula === 'percentage_base_hour') && !plus.hourBucket) {
      issues.push({
        field: `plusRules.${index}.hourBucket`,
        kind: 'missing',
        message: `El plus ${plus.name || index} necesita un tramo horario.`,
      });
    }
    if ((plus.formula === 'per_day' || plus.formula === 'per_shift') && plus.units !== undefined) {
      requireFinite(issues, `plusRules.${index}.units`, plus.units);
    }
    validateSource(issues, `plusRules.${index}.source`, plus.source);
  }

  const plusCoverageRequirements: Array<{
    bucket: 'night' | 'sunday' | 'weekend' | 'holidayNational' | 'holidayAutonomico' | 'holidayProvincial' | 'holidayMunicipal';
    fallback?: 'holiday';
  }> = [
    { bucket: 'night' },
    { bucket: 'sunday' },
    { bucket: 'weekend' },
    { bucket: 'holidayNational', fallback: 'holiday' },
    { bucket: 'holidayAutonomico', fallback: 'holiday' },
    { bucket: 'holidayProvincial', fallback: 'holiday' },
    { bucket: 'holidayMunicipal', fallback: 'holiday' },
  ];
  for (const requirement of plusCoverageRequirements) {
    const applicableHours = input.hours?.breakdown?.[requirement.bucket] ?? 0;
    const covered = input.plusRules?.some((plus) => (
      plus.hourBucket === requirement.bucket
      || (requirement.fallback && plus.hourBucket === requirement.fallback)
    ));
    if (applicableHours > 0 && !covered) {
      issues.push({
        field: `plusRules.${requirement.bucket}`,
        kind: 'missing',
        message: `Falta una regla verificada para ${requirement.bucket}; configure importe cero si el convenio no genera plus.`,
      });
    }
  }

  const contributionEntries: [keyof EmployerContributionConfig, unknown][] = [
    ['commonContingenciesPercent', input.employerContributions?.commonContingenciesPercent],
    ['unemploymentPercent', input.employerContributions?.unemploymentPercent],
    ['fogasaPercent', input.employerContributions?.fogasaPercent],
    ['vocationalTrainingPercent', input.employerContributions?.vocationalTrainingPercent],
    ['meiPercent', input.employerContributions?.meiPercent],
    ['otherPercent', input.employerContributions?.otherPercent],
  ];
  for (const [key, value] of contributionEntries) {
    requireFinite(issues, `employerContributions.${key}`, value);
  }
  validateSource(issues, 'employerContributions.source', input.employerContributions?.source);

  const riskEntries: [keyof OccupationalRiskConfig, unknown][] = [
    ['temporaryDisabilityPercent', input.occupationalRisk?.temporaryDisabilityPercent],
    ['disabilityDeathSurvivorPercent', input.occupationalRisk?.disabilityDeathSurvivorPercent],
  ];
  for (const [key, value] of riskEntries) {
    requireFinite(issues, `occupationalRisk.${key}`, value);
  }
  validateSource(issues, 'occupationalRisk.source', input.occupationalRisk?.source);

  if (!input.contract?.contractType) {
    issues.push({ field: 'contract.contractType', kind: 'missing', message: 'Falta el tipo de contratación.' });
  }
  requireFinite(issues, 'contract.laborContracts', input.contract?.laborContracts, { integer: true });
  requireFinite(issues, 'contract.managementFeePerLaborContract', input.contract?.managementFeePerLaborContract);
  requireFinite(issues, 'contract.terminationProvisionPercent', input.contract?.terminationProvisionPercent);
  requireFinite(issues, 'contract.otherFixedContractCosts', input.contract?.otherFixedContractCosts);
  if (input.contract?.contractType === 'mercantil_autonomo' && input.contract.laborContracts > 0) {
    issues.push({
      field: 'contract.laborContracts',
      kind: 'invalid',
      message: 'Un profesional mercantil no debe generar contratos laborales de gestoría.',
    });
  }

  requireFinite(issues, 'overhead.percentageOnExpandedLabor', input.overhead?.percentageOnExpandedLabor);
  requireFinite(issues, 'overhead.fixedAmount', input.overhead?.fixedAmount);

  for (const [index, line] of (input.directCosts || []).entries()) {
    if (!line.id) issues.push({ field: `directCosts.${index}.id`, kind: 'missing', message: 'Falta el identificador del coste directo.' });
    if (!line.name) issues.push({ field: `directCosts.${index}.name`, kind: 'missing', message: 'Falta el nombre del coste directo.' });
    requireFinite(issues, `directCosts.${index}.amount`, line.amount);
  }

  validatePolicy(issues, input.commercialPolicy);
  if (input.closingPriceExVat !== undefined) {
    requireFinite(issues, 'closingPriceExVat', input.closingPriceExVat, { positive: true });
  }

  return issues;
}

function plusHours(input: CostingInput, rule: LaborPlusRule): number {
  if (!rule.hourBucket) return 0;
  return input.hours.breakdown[rule.hourBucket];
}

function calculatePluses(
  input: CostingInput,
  baseHourlySalaryCost: number,
  salaryForService: number,
): CostLineResult[] {
  return input.plusRules.map((rule) => {
    let amount = 0;
    switch (rule.formula) {
      case 'per_hour':
        amount = plusHours(input, rule) * rule.value;
        break;
      case 'percentage_base_hour':
        amount = plusHours(input, rule) * baseHourlySalaryCost * (rule.value / 100);
        break;
      case 'per_day':
        amount = (rule.units ?? input.hours.workingDays) * rule.value;
        break;
      case 'per_shift':
        amount = (rule.units ?? input.hours.shifts) * rule.value;
        break;
      case 'percentage_salary_cost':
        amount = salaryForService * (rule.value / 100);
        break;
      case 'fixed_total':
        amount = rule.value;
        break;
    }
    return {
      key: rule.id,
      label: rule.name,
      amount: roundMoney(amount),
      sourceId: rule.source?.id,
    };
  });
}

function contributionLines(
  base: number,
  config: EmployerContributionConfig,
): CostLineResult[] {
  const rates: [string, string, number][] = [
    ['common_contingencies', 'Contingencias comunes', config.commonContingenciesPercent],
    ['unemployment', 'Desempleo', config.unemploymentPercent],
    ['fogasa', 'FOGASA', config.fogasaPercent],
    ['vocational_training', 'Formación profesional', config.vocationalTrainingPercent],
    ['mei', 'MEI', config.meiPercent],
    ['other_contributions', 'Otras cotizaciones empresariales', config.otherPercent],
  ];
  return rates.map(([key, label, rate]) => ({
    key,
    label,
    amount: roundMoney(base * rate / 100),
    sourceId: config.source?.id,
  }));
}

function riskLines(base: number, config: OccupationalRiskConfig): CostLineResult[] {
  return [
    {
      key: 'atep_it',
      label: 'AT/EP — incapacidad temporal',
      amount: roundMoney(base * config.temporaryDisabilityPercent / 100),
      sourceId: config.source?.id,
    },
    {
      key: 'atep_ims',
      label: 'AT/EP — invalidez, muerte y supervivencia',
      amount: roundMoney(base * config.disabilityDeathSurvivorPercent / 100),
      sourceId: config.source?.id,
    },
  ];
}

function sumLines(lines: CostLineResult[]): number {
  return roundMoney(lines.reduce((total, line) => total + line.amount, 0));
}

export function calculateInternalCost(input: CostingInput): InternalCostBreakdown {
  const annualExtraPay = input.salary.extraPay.paymentsPerYear
    * input.salary.extraPay.amountPerPayment;
  const contractualAnnualSalary = input.salary.annualOrdinaryBaseSalary
    + annualExtraPay
    + input.salary.annualFixedSupplements
    + input.salary.annualOtherSalaryItems;
  const applicableAnnualSalary = Math.max(contractualAnnualSalary, input.salary.smiAnnual);
  const smiAdjustmentAnnual = applicableAnnualSalary - contractualAnnualSalary;
  const productiveHourlySalaryCost = applicableAnnualSalary / input.salary.annualProductiveHours;
  const salaryForService = productiveHourlySalaryCost * input.hours.coverageHours;
  const pluses = calculatePluses(input, productiveHourlySalaryCost, salaryForService);
  const totalPluses = sumLines(pluses);
  const employerContributionBase = salaryForService + totalPluses;
  const employerContributions = contributionLines(employerContributionBase, input.employerContributions);
  const totalEmployerContributions = sumLines(employerContributions);
  const occupationalRisk = riskLines(employerContributionBase, input.occupationalRisk);
  const totalOccupationalRisk = sumLines(occupationalRisk);
  const expandedLaborCost = salaryForService
    + totalPluses
    + totalEmployerContributions
    + totalOccupationalRisk;

  const labor: LaborCostBreakdown = {
    contractualAnnualSalary: roundMoney(contractualAnnualSalary),
    annualExtraPay: roundMoney(annualExtraPay),
    smiAdjustmentAnnual: roundMoney(smiAdjustmentAnnual),
    applicableAnnualSalary: roundMoney(applicableAnnualSalary),
    productiveHourlySalaryCost: roundRate(productiveHourlySalaryCost),
    salaryForService: roundMoney(salaryForService),
    pluses,
    totalPluses,
    employerContributionBase: roundMoney(employerContributionBase),
    employerContributions,
    totalEmployerContributions,
    occupationalRisk,
    totalOccupationalRisk,
    expandedLaborCost: roundMoney(expandedLaborCost),
  };

  const managementCost = input.contract.laborContracts
    * input.contract.managementFeePerLaborContract;
  const terminationProvision = employerContributionBase
    * input.contract.terminationProvisionPercent / 100;
  const overhead = expandedLaborCost * input.overhead.percentageOnExpandedLabor / 100
    + input.overhead.fixedAmount;
  const directCosts = input.directCosts.map((line) => ({
    key: line.id,
    label: line.name,
    amount: roundMoney(line.amount),
  }));
  const totalDirectCosts = sumLines(directCosts);
  const totalInternalCost = expandedLaborCost
    + managementCost
    + terminationProvision
    + input.contract.otherFixedContractCosts
    + overhead
    + totalDirectCosts;

  return {
    labor,
    managementCost: roundMoney(managementCost),
    terminationProvision: roundMoney(terminationProvision),
    otherContractCosts: roundMoney(input.contract.otherFixedContractCosts),
    overhead: roundMoney(overhead),
    directCosts,
    totalDirectCosts,
    totalInternalCost: roundMoney(totalInternalCost),
  };
}

export function calculateCosting(input: CostingInput): CostingResult {
  const issues = validateCostingInput(input);
  if (issues.length > 0) {
    return {
      status: 'pending_configuration',
      issues,
      action: 'complete_in_administration',
    };
  }

  const internalCost = calculateInternalCost(input);
  const range = calculatePriceRange(internalCost.totalInternalCost, input.commercialPolicy);
  const closingPrice = input.closingPriceExVat ?? range.initialListPriceExVat;

  if (
    closingPrice < range.minimumOrdinaryPriceExVat - 0.005
    || closingPrice > range.initialListPriceExVat + 0.005
  ) {
    return {
      status: 'blocked_closing_price',
      issues: [{
        field: 'closingPriceExVat',
        kind: 'blocked',
        message: 'El precio de cierre está fuera de la banda comercial ordinaria autorizada.',
      }],
      internalCost,
      allowedRange: range,
    };
  }

  const commercial = calculateCommercialResult({
    totalInternalCost: internalCost.totalInternalCost,
    closingPriceExVat: closingPrice,
    policy: input.commercialPolicy,
  });

  const snapshotInput: CostingInput = JSON.parse(JSON.stringify(input));
  const result: CalculatedCostingResult = {
    status: 'calculated',
    internalCost,
    commercial,
    snapshot: {
      engineVersion: COST_ENGINE_VERSION,
      calculatedAt: input.calculatedAt ?? new Date().toISOString(),
      input: snapshotInput,
      internalCost: JSON.parse(JSON.stringify(internalCost)),
      commercial: JSON.parse(JSON.stringify(commercial)),
    },
  };

  return result;
}

/** Proyección que puede salir del servidor sin revelar costes, salarios o comisión. */
export function projectCostingForCommercial(result: CostingResult): CommercialProjection {
  if (result.status === 'pending_configuration') {
    return {
      status: result.status,
      requiresAuthorization: true,
      pendingFields: result.issues.map((issue) => issue.field),
    };
  }
  if (result.status === 'blocked_closing_price') {
    return {
      status: result.status,
      requiresAuthorization: true,
    };
  }
  return {
    status: result.status,
    initialPriceExVat: result.commercial.initialListPriceExVat,
    closingPriceExVat: result.commercial.closingPriceExVat,
    discountAmount: result.commercial.clientDiscountAmount,
    discountPercent: result.commercial.clientDiscountPercentOfList,
    semaphore: result.commercial.semaphore,
    requiresAuthorization: result.commercial.requiresAuthorization,
  };
}
