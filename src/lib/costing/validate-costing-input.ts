import type { CostingInput } from './cost-types';

type JsonObject = Record<string, unknown>;

export interface CostingValidationIssue {
  field: string;
  kind: 'missing' | 'invalid';
  message: string;
}

const contractTypes = new Set(['indefinido', 'temporal', 'fijo_discontinuo', 'mercantil_autonomo']);
const sourceStatuses = new Set(['verified', 'provisional', 'pending_advisor', 'blocked']);
const paymentModes = new Set(['prorated', 'separate']);
const plusFormulas = new Set([
  'per_hour', 'percentage_base_hour', 'per_day', 'per_shift',
  'percentage_salary_cost', 'fixed_total',
]);
const plusBuckets = new Set([
  'total', 'regular', 'night', 'sunday', 'holiday', 'holidayNational',
  'holidayAutonomico', 'holidayProvincial', 'holidayMunicipal', 'weekend',
]);
const directCostCategories = new Set([
  'travel', 'mileage', 'tolls', 'parking', 'allowance', 'accommodation',
  'materials', 'ppe', 'uniform', 'equipment', 'vehicle', 'specific_insurance',
  'occupational_health', 'recruitment', 'other',
]);
const breakdownKeys = [
  'total', 'regular', 'night', 'sunday', 'holiday', 'holidayNational',
  'holidayAutonomico', 'holidayProvincial', 'holidayMunicipal', 'weekend',
] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(field: string, kind: CostingValidationIssue['kind'], message: string): CostingValidationIssue {
  return { field, kind, message };
}

function exactKeys(value: JsonObject, allowed: readonly string[], field: string): CostingValidationIssue | null {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  return unknown ? issue(`${field}.${unknown}`, 'invalid', `Campo no admitido: ${unknown}.`) : null;
}

function requiredObject(parent: JsonObject, key: string, field: string): JsonObject | CostingValidationIssue {
  if (!(key in parent)) return issue(`${field}.${key}`, 'missing', 'Campo obligatorio.');
  return isObject(parent[key]) ? parent[key] as JsonObject : issue(`${field}.${key}`, 'invalid', 'Debe ser un objeto JSON.');
}

function requiredString(parent: JsonObject, key: string, field: string): CostingValidationIssue | null {
  if (!(key in parent)) return issue(`${field}.${key}`, 'missing', 'Campo obligatorio.');
  return typeof parent[key] === 'string' ? null : issue(`${field}.${key}`, 'invalid', 'Debe ser una cadena JSON.');
}

function optionalString(parent: JsonObject, key: string, field: string): CostingValidationIssue | null {
  return !(key in parent) || parent[key] === undefined || typeof parent[key] === 'string'
    ? null
    : issue(`${field}.${key}`, 'invalid', 'Debe ser una cadena JSON.');
}

function requiredNumber(parent: JsonObject, key: string, field: string): CostingValidationIssue | null {
  if (!(key in parent)) return issue(`${field}.${key}`, 'missing', 'Campo obligatorio.');
  return typeof parent[key] === 'number' && Number.isFinite(parent[key])
    ? null
    : issue(`${field}.${key}`, 'invalid', 'Debe ser un número JSON finito.');
}

function optionalNumber(parent: JsonObject, key: string, field: string): CostingValidationIssue | null {
  return !(key in parent) || parent[key] === undefined || (typeof parent[key] === 'number' && Number.isFinite(parent[key]))
    ? null
    : issue(`${field}.${key}`, 'invalid', 'Debe ser un número JSON finito.');
}

function requiredEnum(parent: JsonObject, key: string, field: string, allowed: Set<string>): CostingValidationIssue | null {
  if (!(key in parent)) return issue(`${field}.${key}`, 'missing', 'Campo obligatorio.');
  return typeof parent[key] === 'string' && allowed.has(parent[key] as string)
    ? null
    : issue(`${field}.${key}`, 'invalid', 'Valor no admitido.');
}

function optionalEnum(parent: JsonObject, key: string, field: string, allowed: Set<string>): CostingValidationIssue | null {
  return !(key in parent) || parent[key] === undefined || (typeof parent[key] === 'string' && allowed.has(parent[key] as string))
    ? null
    : issue(`${field}.${key}`, 'invalid', 'Valor no admitido.');
}

function first(...values: Array<CostingValidationIssue | null>): CostingValidationIssue | null {
  return values.find(Boolean) ?? null;
}

function validateSource(value: unknown, field: string): CostingValidationIssue | null {
  if (value === undefined) return null;
  if (!isObject(value)) return issue(field, 'invalid', 'Debe ser un objeto JSON.');
  return first(
    exactKeys(value, ['id', 'label', 'url', 'effectiveFrom', 'effectiveTo', 'status'], field),
    requiredString(value, 'id', field), requiredString(value, 'label', field),
    optionalString(value, 'url', field), optionalString(value, 'effectiveFrom', field), optionalString(value, 'effectiveTo', field),
    requiredEnum(value, 'status', field, sourceStatuses),
  );
}

function validateHours(value: unknown): CostingValidationIssue | null {
  const field = 'input.hours';
  if (!isObject(value)) return issue(field, value === undefined ? 'missing' : 'invalid', 'Debe ser un objeto JSON.');
  const top = first(
    exactKeys(value, ['coverageHours', 'workingDays', 'shifts', 'breakdown'], field),
    requiredNumber(value, 'coverageHours', field), requiredNumber(value, 'workingDays', field), requiredNumber(value, 'shifts', field),
  );
  if (top) return top;
  const breakdown = requiredObject(value, 'breakdown', field);
  if (!isObject(breakdown)) return breakdown;
  const unknown = exactKeys(breakdown, breakdownKeys, `${field}.breakdown`);
  if (unknown) return unknown;
  for (const key of breakdownKeys) {
    const error = requiredNumber(breakdown, key, `${field}.breakdown`);
    if (error) return error;
  }
  return null;
}

function validateSalary(value: unknown): CostingValidationIssue | null {
  const field = 'input.salary';
  if (!isObject(value)) return issue(field, value === undefined ? 'missing' : 'invalid', 'Debe ser un objeto JSON.');
  const allowed = ['annualOrdinaryBaseSalary', 'extraPay', 'annualFixedSupplements', 'annualOtherSalaryItems', 'annualConventionHours', 'annualProductiveHours', 'smiAnnual', 'source'];
  const top = first(
    exactKeys(value, allowed, field),
    requiredNumber(value, 'annualOrdinaryBaseSalary', field), requiredNumber(value, 'annualFixedSupplements', field),
    requiredNumber(value, 'annualOtherSalaryItems', field), requiredNumber(value, 'annualConventionHours', field),
    requiredNumber(value, 'annualProductiveHours', field), requiredNumber(value, 'smiAnnual', field),
    validateSource(value.source, `${field}.source`),
  );
  if (top) return top;
  const extraPay = requiredObject(value, 'extraPay', field);
  if (!isObject(extraPay)) return extraPay;
  return first(
    exactKeys(extraPay, ['paymentsPerYear', 'amountPerPayment', 'paymentMode'], `${field}.extraPay`),
    requiredNumber(extraPay, 'paymentsPerYear', `${field}.extraPay`),
    requiredNumber(extraPay, 'amountPerPayment', `${field}.extraPay`),
    requiredEnum(extraPay, 'paymentMode', `${field}.extraPay`, paymentModes),
  );
}

function validatePlusRules(value: unknown): CostingValidationIssue | null {
  const field = 'input.plusRules';
  if (!Array.isArray(value)) return issue(field, value === undefined ? 'missing' : 'invalid', 'Debe ser un array JSON.');
  for (let index = 0; index < value.length; index++) {
    const itemField = `${field}[${index}]`;
    const item = value[index];
    if (!isObject(item)) return issue(itemField, 'invalid', 'Debe ser un objeto JSON.');
    const error = first(
      exactKeys(item, ['id', 'name', 'formula', 'value', 'hourBucket', 'units', 'source'], itemField),
      requiredString(item, 'id', itemField), requiredString(item, 'name', itemField),
      requiredEnum(item, 'formula', itemField, plusFormulas), requiredNumber(item, 'value', itemField),
      optionalEnum(item, 'hourBucket', itemField, plusBuckets), optionalNumber(item, 'units', itemField),
      validateSource(item.source, `${itemField}.source`),
    );
    if (error) return error;
  }
  return null;
}

function validateFlatNumericObject(value: unknown, field: string, keys: readonly string[], sourceAllowed = false): CostingValidationIssue | null {
  if (!isObject(value)) return issue(field, value === undefined ? 'missing' : 'invalid', 'Debe ser un objeto JSON.');
  const allowed = sourceAllowed ? [...keys, 'source'] : [...keys];
  const unknown = exactKeys(value, allowed, field);
  if (unknown) return unknown;
  for (const key of keys) {
    const error = requiredNumber(value, key, field);
    if (error) return error;
  }
  return sourceAllowed ? validateSource(value.source, `${field}.source`) : null;
}

function validateContract(value: unknown): CostingValidationIssue | null {
  const field = 'input.contract';
  if (!isObject(value)) return issue(field, value === undefined ? 'missing' : 'invalid', 'Debe ser un objeto JSON.');
  return first(
    exactKeys(value, ['contractType', 'laborContracts', 'managementFeePerLaborContract', 'terminationProvisionPercent', 'otherFixedContractCosts'], field),
    requiredEnum(value, 'contractType', field, contractTypes),
    requiredNumber(value, 'laborContracts', field), requiredNumber(value, 'managementFeePerLaborContract', field),
    requiredNumber(value, 'terminationProvisionPercent', field), requiredNumber(value, 'otherFixedContractCosts', field),
  );
}

function validateDirectCosts(value: unknown): CostingValidationIssue | null {
  const field = 'input.directCosts';
  if (!Array.isArray(value)) return issue(field, value === undefined ? 'missing' : 'invalid', 'Debe ser un array JSON.');
  for (let index = 0; index < value.length; index++) {
    const itemField = `${field}[${index}]`;
    const item = value[index];
    if (!isObject(item)) return issue(itemField, 'invalid', 'Debe ser un objeto JSON.');
    const error = first(
      exactKeys(item, ['id', 'name', 'amount', 'category'], itemField),
      requiredString(item, 'id', itemField), requiredString(item, 'name', itemField), requiredNumber(item, 'amount', itemField),
      requiredEnum(item, 'category', itemField, directCostCategories),
    );
    if (error) return error;
  }
  return null;
}

export function validateCostingRequestBody(body: unknown):
  | { ok: true; input: CostingInput }
  | { ok: false; issue: CostingValidationIssue } {
  if (!isObject(body)) return { ok: false, issue: issue('request', 'invalid', 'El cuerpo de la solicitud debe ser un objeto JSON.') };
  const bodyKeys = exactKeys(body, ['input'], 'request');
  if (bodyKeys) return { ok: false, issue: bodyKeys };
  if (!isObject(body.input)) return { ok: false, issue: issue('input', body.input === undefined ? 'missing' : 'invalid', 'Faltan datos válidos del cálculo económico.') };

  const input = body.input;
  const inputAllowed = ['serviceId', 'professionalProfile', 'province', 'municipality', 'hours', 'salary', 'plusRules', 'employerContributions', 'occupationalRisk', 'contract', 'overhead', 'directCosts', 'commercialPolicy', 'closingPriceExVat', 'calculatedAt'];
  const error = first(
    exactKeys(input, inputAllowed, 'input'),
    optionalString(input, 'serviceId', 'input'), requiredString(input, 'professionalProfile', 'input'), requiredString(input, 'province', 'input'), optionalString(input, 'municipality', 'input'),
    validateHours(input.hours), validateSalary(input.salary), validatePlusRules(input.plusRules),
    validateFlatNumericObject(input.employerContributions, 'input.employerContributions', ['commonContingenciesPercent', 'unemploymentPercent', 'fogasaPercent', 'vocationalTrainingPercent', 'meiPercent', 'otherPercent'], true),
    validateFlatNumericObject(input.occupationalRisk, 'input.occupationalRisk', ['temporaryDisabilityPercent', 'disabilityDeathSurvivorPercent'], true),
    validateContract(input.contract),
    validateFlatNumericObject(input.overhead, 'input.overhead', ['percentageOnExpandedLabor', 'fixedAmount']),
    validateDirectCosts(input.directCosts),
    validateFlatNumericObject(input.commercialPolicy, 'input.commercialPolicy', ['gasiMarkupOnCostPercent', 'commercialFloorOnCostPercent', 'commercialBufferOnCostPercent', 'commissionAtFloorPercent', 'commissionIntermediatePercent', 'commissionAtListPercent', 'semaphoreTargetReturnOnCostPercent', 'semaphoreReviewReturnOnCostPercent']),
    optionalNumber(input, 'closingPriceExVat', 'input'), optionalString(input, 'calculatedAt', 'input'),
  );

  return error ? { ok: false, issue: error } : { ok: true, input: input as unknown as CostingInput };
}
