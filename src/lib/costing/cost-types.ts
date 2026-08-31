import type { ShiftHourBreakdown } from '../types';
import { version } from '../../../package.json';

/** Fuente única de la versión del motor de cálculo. */
export const COST_ENGINE_VERSION = '1.0.0';

/** Fuente única de la versión de la aplicación: el campo `version` de package.json. */
export const APP_VERSION = version;

export type ContractType =
  | 'indefinido'
  | 'temporal'
  | 'fijo_discontinuo'
  | 'mercantil_autonomo';

export type CostEngineStatus =
  | 'calculated'
  | 'pending_configuration'
  | 'blocked_closing_price';

export type DataIssueKind = 'missing' | 'invalid' | 'blocked';

export interface DataIssue {
  field: string;
  kind: DataIssueKind;
  message: string;
}

export interface CostSourceRef {
  id: string;
  label: string;
  url?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  status: 'verified' | 'provisional' | 'pending_advisor' | 'blocked';
}

export interface CostHoursInput {
  coverageHours: number;
  workingDays: number;
  shifts: number;
  breakdown: ShiftHourBreakdown;
}

export interface ExtraPayConfig {
  paymentsPerYear: number;
  amountPerPayment: number;
  paymentMode: 'prorated' | 'separate';
}

export interface SalaryConfig {
  /** Suma anual de las mensualidades ordinarias, sin pagas extra. */
  annualOrdinaryBaseSalary: number;
  extraPay: ExtraPayConfig;
  annualFixedSupplements: number;
  annualOtherSalaryItems: number;
  annualConventionHours: number;
  /** Horas realmente vendibles. Incluyen el efecto de vacaciones, permisos y tiempo no facturable. */
  annualProductiveHours: number;
  smiAnnual: number;
  source?: CostSourceRef;
}

export type PlusFormula =
  | 'per_hour'
  | 'percentage_base_hour'
  | 'per_day'
  | 'per_shift'
  | 'percentage_salary_cost'
  | 'fixed_total';

export type PlusHourBucket =
  | 'total'
  | 'regular'
  | 'night'
  | 'sunday'
  | 'holiday'
  | 'holidayNational'
  | 'holidayAutonomico'
  | 'holidayProvincial'
  | 'holidayMunicipal'
  | 'weekend';

export interface LaborPlusRule {
  id: string;
  name: string;
  formula: PlusFormula;
  value: number;
  hourBucket?: PlusHourBucket;
  /** Unidades explícitas cuando la fórmula no puede inferirse del agregado horario. */
  units?: number;
  source?: CostSourceRef;
}

export interface EmployerContributionConfig {
  commonContingenciesPercent: number;
  unemploymentPercent: number;
  fogasaPercent: number;
  vocationalTrainingPercent: number;
  meiPercent: number;
  otherPercent: number;
  source?: CostSourceRef;
}

export interface OccupationalRiskConfig {
  temporaryDisabilityPercent: number;
  disabilityDeathSurvivorPercent: number;
  source?: CostSourceRef;
}

export interface ContractCostConfig {
  contractType: ContractType;
  laborContracts: number;
  managementFeePerLaborContract: number;
  terminationProvisionPercent: number;
  otherFixedContractCosts: number;
}

export interface OverheadConfig {
  percentageOnExpandedLabor: number;
  fixedAmount: number;
}

export interface DirectCostLine {
  id: string;
  name: string;
  amount: number;
  category:
    | 'travel'
    | 'mileage'
    | 'tolls'
    | 'parking'
    | 'allowance'
    | 'accommodation'
    | 'materials'
    | 'ppe'
    | 'uniform'
    | 'equipment'
    | 'vehicle'
    | 'specific_insurance'
    | 'occupational_health'
    | 'recruitment'
    | 'other';
}

export interface CommercialPolicy {
  gasiMarkupOnCostPercent: number;
  commercialFloorOnCostPercent: number;
  commercialBufferOnCostPercent: number;
  commissionAtFloorPercent: number;
  commissionIntermediatePercent: number;
  commissionAtListPercent: number;
  semaphoreTargetReturnOnCostPercent: number;
  semaphoreReviewReturnOnCostPercent: number;
}

export interface CostingInput {
  serviceId?: string;
  professionalProfile: string;
  province: string;
  municipality?: string;
  hours: CostHoursInput;
  salary: SalaryConfig;
  plusRules: LaborPlusRule[];
  employerContributions: EmployerContributionConfig;
  occupationalRisk: OccupationalRiskConfig;
  contract: ContractCostConfig;
  overhead: OverheadConfig;
  directCosts: DirectCostLine[];
  commercialPolicy: CommercialPolicy;
  /** Si se omite, se calcula el presupuesto al precio inicial máximo ordinario. */
  closingPriceExVat?: number;
  calculatedAt?: string;
}

export interface CostLineResult {
  key: string;
  label: string;
  amount: number;
  sourceId?: string;
}

export interface LaborCostBreakdown {
  contractualAnnualSalary: number;
  annualExtraPay: number;
  smiAdjustmentAnnual: number;
  applicableAnnualSalary: number;
  productiveHourlySalaryCost: number;
  salaryForService: number;
  pluses: CostLineResult[];
  totalPluses: number;
  employerContributionBase: number;
  employerContributions: CostLineResult[];
  totalEmployerContributions: number;
  occupationalRisk: CostLineResult[];
  totalOccupationalRisk: number;
  expandedLaborCost: number;
}

export interface InternalCostBreakdown {
  labor: LaborCostBreakdown;
  managementCost: number;
  terminationProvision: number;
  otherContractCosts: number;
  overhead: number;
  directCosts: CostLineResult[];
  totalDirectCosts: number;
  totalInternalCost: number;
}

export type EconomicSemaphore = 'green' | 'yellow' | 'red';
export type CommissionTier = 'floor' | 'intermediate' | 'list';

export interface CommercialResult {
  minimumOrdinaryPriceExVat: number;
  initialListPriceExVat: number;
  closingPriceExVat: number;
  clientDiscountAmount: number;
  clientDiscountPercentOfList: number;
  commercialBufferConsumedPercentOfCost: number;
  netBeforeCommission: number;
  commissionTier: CommissionTier;
  commissionRatePercent: number;
  commissionAmount: number;
  finalGasiBenefit: number;
  gasiReturnOnCostPercent: number;
  finalMarginOnSalePercent: number;
  semaphore: EconomicSemaphore;
  requiresAuthorization: boolean;
}

export interface CostSnapshot {
  engineVersion: string;
  calculatedAt: string;
  input: CostingInput;
  internalCost: InternalCostBreakdown;
  commercial: CommercialResult;
}

export interface CalculatedCostingResult {
  status: 'calculated';
  internalCost: InternalCostBreakdown;
  commercial: CommercialResult;
  snapshot: CostSnapshot;
}

export interface PendingCostingResult {
  status: 'pending_configuration';
  issues: DataIssue[];
  action: 'complete_in_administration';
}

export interface BlockedClosingPriceResult {
  status: 'blocked_closing_price';
  issues: DataIssue[];
  internalCost: InternalCostBreakdown;
  allowedRange: {
    minimumOrdinaryPriceExVat: number;
    initialListPriceExVat: number;
  };
}

export type CostingResult =
  | CalculatedCostingResult
  | PendingCostingResult
  | BlockedClosingPriceResult;

export interface CommercialProjection {
  status: CostEngineStatus;
  initialPriceExVat?: number;
  closingPriceExVat?: number;
  discountAmount?: number;
  discountPercent?: number;
  semaphore?: EconomicSemaphore;
  requiresAuthorization: boolean;
  pendingFields?: string[];
}

