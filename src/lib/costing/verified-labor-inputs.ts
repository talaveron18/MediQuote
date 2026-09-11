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

export const VERIFIED_LABOR_UNITS: Record<VerifiedLaborConcept, string> = {
  productive_hour_gross: 'EUR/h_productiva',
  management_fee_per_contract: 'EUR/contrato',
  annual_convention_hours: 'h/año',
  annual_productive_hours: 'h/año',
  ss_common_contingencies_percent: '%',
  ss_unemployment_percent: '%',
  ss_fogasa_percent: '%',
  ss_training_percent: '%',
  ss_mei_percent: '%',
  atep_percent: '%',
}

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
const normalizeOptionalText = (value?: string | null) => value?.trim() || undefined

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
  const knownConcept = CONCEPTS.has(draft.conceptKey)
  if (!knownConcept) {
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
  const unit = normalizeText(draft.unit)
  if (!unit) {
    issues.push({ field: 'unit', kind: 'missing', message: 'Falta la unidad del concepto.' })
  } else if (knownConcept) {
    const expectedUnit = VERIFIED_LABOR_UNITS[draft.conceptKey as VerifiedLaborConcept]
    if (unit !== expectedUnit) {
      issues.push({
        field: 'unit',
        kind: 'invalid',
        message: `La unidad canónica de ${draft.conceptKey} debe ser ${expectedUnit}.`,
      })
    }
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

function equivalentVersion(existing: VerifiedLaborInputRecord, draft: LaborInputDraft): boolean {
  return existing.conceptKey === draft.conceptKey
    && existing.categoryId === normalizeText(draft.categoryId)
    && normalizeTerritory(existing.territory) === normalizeTerritory(draft.territory)
    && existing.contractType === draft.contractType
    && existing.value === Number(draft.value)
    && existing.unit === normalizeText(draft.unit)
    && existing.effectiveFrom === draft.effectiveFrom
    && (existing.effectiveTo ?? undefined) === (draft.effectiveTo || undefined)
    && existing.sourceDocument === normalizeText(draft.sourceDocument)
    && existing.sourceDate === draft.sourceDate
    && (existing.notes ?? undefined) === normalizeOptionalText(draft.notes)
    && existing.status === draft.status
}

function validatePersistedRecord(record: VerifiedLaborInputRecord): DataIssue[] {
  const issues = validateLaborInputDraft({
    id: record.id,
    conceptKey: record.conceptKey,
    categoryId: record.categoryId,
    territory: record.territory,
    contractType: record.contractType,
    value: record.value,
    unit: record.unit,
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo,
    sourceDocument: record.sourceDocument,
    sourceDate: record.sourceDate,
    notes: record.notes,
    status: record.status,
  })
  if (!record.id.trim()) {
    issues.push({ field: 'id', kind: 'invalid', message: 'La versión persistida no tiene identificador válido.' })
  }
  if (!record.recordedBy?.trim()) {
    issues.push({ field: 'recordedBy', kind: 'invalid', message: 'La versión persistida no conserva quién la incorporó.' })
  }
  if (!record.recordedAt || Number.isNaN(Date.parse(record.recordedAt))) {
    issues.push({ field: 'recordedAt', kind: 'invalid', message: 'La versión persistida no conserva una fecha de incorporación válida.' })
  }
  return issues
}

export function appendLaborInputVersion(params: {
  current: VerifiedLaborInputRecord[]
  draft: LaborInputDraft
  actorId: string
  now?: Date
}): { status: 'ok'; records: VerifiedLaborInputRecord[]; record: VerifiedLaborInputRecord; duplicate: boolean }
  | { status: 'conflict'; issues: DataIssue[]; record: VerifiedLaborInputRecord }
  | { status: 'invalid'; issues: DataIssue[] } {
  const issues = validateLaborInputDraft(params.draft)
  if (issues.length) return { status: 'invalid', issues }

  const id = params.draft.id?.trim() || canonicalId(params.draft)
  const existing = params.current.find((row) => row.id === id)
  if (existing) {
    if (equivalentVersion(existing, params.draft)) {
      return { status: 'ok', records: params.current, record: existing, duplicate: true }
    }
    return {
      status: 'conflict',
      record: existing,
      issues: [{
        field: `verifiedLaborInputs.${id}`,
        kind: 'blocked',
        message: 'La identidad de versión ya existe con contenido distinto. Registre una nueva versión/fuente; no se sobrescribe ni se ignora la discrepancia.',
      }],
    }
  }

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

  const invalidPersisted = matches.flatMap((record) => validatePersistedRecord(record).map((issue) => ({
    ...issue,
    field: `${field}.${record.id}.${issue.field}`,
    kind: 'blocked' as const,
    message: `Dato verified persistido inválido: ${issue.message}`,
  })))
  if (invalidPersisted.length > 0) {
    return { status: 'pending_configuration', issues: invalidPersisted }
  }

  if (matches.length > 1) {
    return { status: 'pending_configuration', issues: [{
      field, kind: 'blocked', message: 'Existen versiones verified solapadas; debe resolverse la ambigüedad antes de presupuestar.',
    }] }
  }
  const record = matches[0]
  const expectedUnit = VERIFIED_LABOR_UNITS[params.conceptKey]
  if (record.unit !== expectedUnit) {
    return { status: 'pending_configuration', issues: [{
      field: `${field}.unit`,
      kind: 'invalid',
      message: `La versión verified usa ${record.unit}; se requiere la unidad canónica ${expectedUnit}.`,
    }] }
  }
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

export function resolveVerifiedLaborInputForDates(params: {
  records: VerifiedLaborInputRecord[]
  conceptKey: VerifiedLaborConcept
  categoryId: string
  territory: string
  contractType: ContractType
  serviceDates: string[]
}): ReturnType<typeof resolveVerifiedLaborInput> {
  const dates = [...new Set(params.serviceDates)].sort()
  if (dates.length === 0) {
    return { status: 'pending_configuration', issues: [{
      field: `verifiedLaborInputs.${params.conceptKey}.${params.categoryId}.${params.territory}.${params.contractType}`,
      kind: 'missing',
      message: 'No hay fechas de servicio para resolver la vigencia del coste laboral.',
    }] }
  }
  const resolved = dates.map((serviceDate) => resolveVerifiedLaborInput({ ...params, serviceDate }))
  const firstPending = resolved.find((result) => result.status === 'pending_configuration')
  if (firstPending?.status === 'pending_configuration') return firstPending
  const ready = resolved.filter((result): result is Extract<ReturnType<typeof resolveVerifiedLaborInput>, { status: 'ready' }> => result.status === 'ready')
  const ids = new Set(ready.map((result) => result.record.id))
  if (ids.size !== 1) {
    return { status: 'pending_configuration', issues: [{
      field: `verifiedLaborInputs.${params.conceptKey}.${params.categoryId}.${params.territory}.${params.contractType}`,
      kind: 'blocked',
      message: 'El bloque cruza versiones distintas del coste laboral; debe dividirse por vigencia antes de presupuestar.',
    }] }
  }
  return ready[0]
}
