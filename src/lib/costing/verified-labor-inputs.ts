import type { CostSourceRef, ContractType, DataIssue } from './cost-types'

export const VERIFIED_LABOR_INPUTS_KEY = 'costing_verified_labor_inputs_v1'

export const VERIFIED_LABOR_CONCEPTS = [
  'productive_hour_gross',
  'management_fee_per_contract',
  'annual_convention_hours',
  'annual_productive_hours',
  'ss_common_contingencies_percent',
  'ss_unemployment_percent',
  'ss_fogasa_percent',
  'ss_training_percent',
  'ss_mei_percent',
  'atep_percent',
] as const

export type VerifiedLaborConcept = typeof VERIFIED_LABOR_CONCEPTS[number]
export type LaborInputStatus = 'verified' | 'pending'

export interface VerifiedLaborInputRecord {
  id: string
  conceptKey: VerifiedLaborConcept
  categoryId: string
  territory: string
  contractType: ContractType
  value: number
  unit: string
  effectiveFrom: string
  effectiveTo?: string
  sourceDocument: string
  sourceDate: string
  notes?: string
  status: LaborInputStatus
  recordedBy: string
  recordedAt: string
}

export interface LaborInputDraft {
  id?: string
  conceptKey: string
  categoryId: string
  territory: string
  contractType: string
  value: unknown
  unit: string
  effectiveFrom: string
  effectiveTo?: string | null
  sourceDocument: string
  sourceDate: string
  notes?: string
  status: string
}

const CONTRACT_TYPES = new Set<ContractType>([
  'indefinido', 'temporal', 'fijo_discontinuo', 'mercantil_autonomo',
])
const CONCEPTS = new Set<string>(VERIFIED_LABOR_CONCEPTS)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const normalizeText = (value: string) => value.trim()
const normalizeTerritory = (value: string) => value.trim().toLocaleLowerCase('es-ES')

export function parseVerifiedLaborInputStore(raw?: string | null): VerifiedLaborInputRecord[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((row): row is VerifiedLaborInputRecord => (
      row && typeof row === 'object' && typeof row.id === 'string'
    ))
  } catch {
    return []
  }
}

export function validateLaborInputDraft(draft: LaborInputDraft): DataIssue[] {
  const issues: DataIssue[] = []
  if (!CONCEPTS.has(draft.conceptKey)) {
    issues.push({ field: 'conceptKey', kind: 'invalid', message: 'Concepto de coste no reconocido.' })
  }
  if (!normalizeText(draft.categoryId)) {
    issues.push({ field: 'categoryId', kind: 'missing', message: 'Falta la categoría profesional.' })
  }
  if (!normalizeText(draft.territory)) {
    issues.push({ field: 'territory', kind: 'missing', message: 'Falta el territorio/convenio.' })
  }
  if (!CONTRACT_TYPES.has(draft.contractType as ContractType)) {
    issues.push({ field: 'contractType', kind: 'invalid', message: 'Modalidad contractual no reconocida.' })
  }
  const value = Number(draft.value)
  if (!Number.isFinite(value) || value < 0) {
    issues.push({ field: 'value', kind: 'invalid', message: 'El valor debe ser finito y no negativo.' })
  }
  if (!normalizeText(draft.unit)) {
    issues.push({ field: 'unit', kind: 'missing', message: 'Falta la unidad del concepto.' })
  }
  if (!ISO_DATE.test(draft.effectiveFrom)) {
    issues.push({ field: 'effectiveFrom', kind: 'invalid', message: 'effectiveFrom debe ser una fecha ISO.' })
  }
  if (draft.effectiveTo && !ISO_DATE.test(draft.effectiveTo)) {
    issues.push({ field: 'effectiveTo', kind: 'invalid', message: 'effectiveTo debe ser una fecha ISO.' })
  }
  if (draft.effectiveTo && ISO_DATE.test(draft.effectiveFrom) && draft.effectiveTo < draft.effectiveFrom) {
    issues.push({ field: 'effectiveTo', kind: 'invalid', message: 'effectiveTo no puede ser anterior a effectiveFrom.' })
  }
  if (!normalizeText(draft.sourceDocument)) {
    issues.push({ field: 'sourceDocument', kind: 'missing', message: 'Falta la referencia documental de gestoría.' })
  }
  if (!ISO_DATE.test(draft.sourceDate)) {
    issues.push({ field: 'sourceDate', kind: 'invalid', message: 'sourceDate debe ser una fecha ISO.' })
  }
  if (draft.status !== 'verified' && draft.status !== 'pending') {
    issues.push({ field: 'status', kind: 'invalid', message: 'El estado debe ser verified o pending.' })
  }
  return issues
}

function canonicalId(draft: LaborInputDraft) {
  return [
    draft.conceptKey,
    normalizeText(draft.categoryId),
    normalizeTerritory(draft.territory),
    draft.contractType,
    draft.effectiveFrom,
    draft.effectiveTo ?? '',
    normalizeText(draft.sourceDocument),
    draft.sourceDate,
  ].join('|')
}

export function appendLaborInputVersion(params: {
  current: VerifiedLaborInputRecord[]
  draft: LaborInputDraft
  actorId: string
  now?: Date
}): { status: 'ok'; records: VerifiedLaborInputRecord[]; record: VerifiedLaborInputRecord; duplicate: boolean }
  | { status: 'invalid'; issues: DataIssue[] } {
  const issues = validateLaborInputDraft(params.draft)
  if (issues.length) return { status: 'invalid', issues }

  const id = params.draft.id?.trim() || canonicalId(params.draft)
  const existing = params.current.find((row) => row.id === id)
  if (existing) return { status: 'ok', records: params.current, record: existing, duplicate: true }

  const record: VerifiedLaborInputRecord = {
    id,
    conceptKey: params.draft.conceptKey as VerifiedLaborConcept,
    categoryId: normalizeText(params.draft.categoryId),
    territory: normalizeText(params.draft.territory),
    contractType: params.draft.contractType as ContractType,
    value: Number(params.draft.value),
    unit: normalizeText(params.draft.unit),
    effectiveFrom: params.draft.effectiveFrom,
    ...(params.draft.effectiveTo ? { effectiveTo: params.draft.effectiveTo } : {}),
    sourceDocument: normalizeText(params.draft.sourceDocument),
    sourceDate: params.draft.sourceDate,
    ...(params.draft.notes?.trim() ? { notes: params.draft.notes.trim() } : {}),
    status: params.draft.status as LaborInputStatus,
    recordedBy: params.actorId,
    recordedAt: (params.now ?? new Date()).toISOString(),
  }
  return { status: 'ok', records: [...params.current, record], record, duplicate: false }
}

export function resolveVerifiedLaborInput(params: {
  records: VerifiedLaborInputRecord[]
  conceptKey: VerifiedLaborConcept
  categoryId: string
  territory: string
  contractType: ContractType
  serviceDate: string
}): { status: 'ready'; value: number; unit: string; source: CostSourceRef; record: VerifiedLaborInputRecord }
  | { status: 'pending_configuration'; issues: DataIssue[] } {
  const matches = params.records.filter((row) => (
    row.status === 'verified'
    && row.conceptKey === params.conceptKey
    && row.categoryId === params.categoryId
    && normalizeTerritory(row.territory) === normalizeTerritory(params.territory)
    && row.contractType === params.contractType
    && row.effectiveFrom <= params.serviceDate
    && (!row.effectiveTo || row.effectiveTo >= params.serviceDate)
  ))
  const field = `verifiedLaborInputs.${params.conceptKey}.${params.categoryId}.${params.territory}.${params.contractType}`
  if (matches.length === 0) {
    return { status: 'pending_configuration', issues: [{
      field, kind: 'missing', message: 'No existe un dato de gestoría verified vigente para esta configuración.',
    }] }
  }
  if (matches.length > 1) {
    return { status: 'pending_configuration', issues: [{
      field, kind: 'blocked', message: 'Existen versiones verified solapadas; debe resolverse la ambigüedad antes de presupuestar.',
    }] }
  }
  const record = matches[0]
  return {
    status: 'ready', value: record.value, unit: record.unit, record,
    source: {
      id: `gestoria:${record.id}`,
      label: `Gestoría: ${record.sourceDocument}`,
      effectiveFrom: record.effectiveFrom,
      effectiveTo: record.effectiveTo,
      status: 'verified',
    },
  }
}
