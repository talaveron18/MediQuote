export const REVIEWER_ROLES = ['gestoria', 'finanzas', 'auditor', 'legal'] as const;
export type ReviewerRole = (typeof REVIEWER_ROLES)[number];
export type ReviewSeverity = 'info' | 'warning' | 'high' | 'critical';
export type ReviewStatus = 'apto' | 'apto_con_observaciones' | 'no_apto';
export type DecisionStatus = 'aceptado' | 'resuelto' | 'aplazado' | 'bloqueado';
export type RiskCategory = 'laboral' | 'financiero' | 'operativo' | 'contractual' | 'documental' | 'datos_privacidad';
export type EvidenceSourceType = 'presupuesto' | 'motor' | 'documento' | 'contrato' | 'regla_empresa' | 'supuesto_ia' | 'usuario';

export interface ReviewFinding {
  id: string;
  title: string;
  detail: string;
  severity: ReviewSeverity;
  evidence: string[];
  evidenceSource?: EvidenceSourceType;
  whyDetected?: string;
  riskCategory?: RiskCategory;
  impact?: 'bajo' | 'medio' | 'alto' | 'critico';
  probability?: 'baja' | 'media' | 'alta' | 'no_evaluable';
  responsible?: string;
  dependency?: string;
  recommendation: string;
  requiresHumanValidation: boolean;
}

export interface SpecialistReview {
  reviewer: ReviewerRole;
  label: string;
  status: ReviewStatus;
  summary: string;
  findings: ReviewFinding[];
  assumptions: string[];
  demo: boolean;
}

export interface ServiceIntakeDraft {
  clientName: string;
  professionalCategory: string;
  autonomousCommunity: string;
  province: string;
  municipality: string;
  startDate: string;
  endDate: string;
  schedule: string;
  professionals: number;
  contractType: string;
  notes: string;
  pendingConfirmation: string[];
}

export interface BudgetSnapshot {
  reference: string;
  clientName: string;
  professionalCategory: string;
  autonomousCommunity: string;
  province: string;
  municipality: string;
  startDate: string;
  endDate: string;
  schedule: string;
  professionals: number;
  contractType: string;
  baseCost: number;
  pluses: number;
  socialSecurity: number;
  overhead: number;
  priceExVat: number;
  vatPercent: number;
  totalWithVat: number;
  annualProductiveHours: number;
}

export interface JointVerdict {
  status: ReviewStatus;
  headline: string;
  criticalCount: number;
  highCount: number;
  blockingFindingIds: string[];
  conditions: string[];
}

export interface ProsecutorView {
  accusation: string;
  weakestAssumption: string;
  worstReasonableCase: string;
  evidenceToRequest: string[];
  finalChallenge: string;
}

export interface DefenseView {
  strongestGrounds: string[];
  coveredRisks: string[];
  favorableEvidence: string[];
  resolvableObjections: string[];
  priceDefense: string;
  approvalConditions: string[];
}

export interface ReviewerContradiction {
  id: string;
  reviewers: ReviewerRole[];
  statement: string;
  consequence: string;
  requiresHumanResolution: boolean;
}

export interface HumanDecision {
  findingId: string;
  status: DecisionStatus;
  comment: string;
  decidedAt: string;
  decidedBy: string;
}

export interface ContractDraft {
  title: string;
  reference: string;
  clauses: Array<{ heading: string; text: string }>;
  pendingFields: string[];
  commercialPriceExVat: number;
  generatedAt: string;
  demo: boolean;
}

export interface OperationalAnnex {
  reference: string;
  sections: Array<{ heading: string; text: string }>;
  included: string[];
  excluded: string[];
  pendingFields: string[];
  generatedAt: string;
}

export interface ConsistencyIssue {
  field: string;
  budgetValue: string;
  contractValue: string;
  severity: ReviewSeverity;
  message: string;
}

export interface ConsistencyCheck {
  consistent: boolean;
  issues: ConsistencyIssue[];
  checkedAt: string;
}

export interface ScenarioResult {
  type: 'absentismo' | 'descuento' | 'incremento_salarial';
  inputPercent: number;
  originalCost: number;
  adjustedCost: number;
  originalMargin: number;
  adjustedMargin: number;
  marginDelta: number;
  status: 'verde' | 'ambar' | 'rojo';
  explanation: string;
}

export interface ReviewBundle {
  mode: 'demo' | 'openai';
  generatedAt: string;
  reviews: SpecialistReview[];
  verdict: JointVerdict;
  prosecutor: ProsecutorView;
  defense?: DefenseView;
  contradictions?: ReviewerContradiction[];
}

export interface BudgetVersionComparison {
  stale: boolean;
  changes: Array<{ field: string; before: string; after: string; material: boolean }>;
  previousCost: number;
  currentCost: number;
  previousPrice: number;
  currentPrice: number;
  reviewRequired: boolean;
}

export interface ReviewIntegrityRecord {
  budgetReference: string;
  version: number;
  inputHash: string;
  outputHash: string;
  generatedAt: string;
  mode: 'demo' | 'openai';
  reviewers: ReviewerRole[];
  verdict: ReviewStatus;
  findings: number;
  decisions: HumanDecision[];
  disclaimer: string;
}
