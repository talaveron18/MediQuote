import { canonicalJson, type CanonicalJson, type SourceDocumentFingerprint } from './immutable-artifact'

export type GestoriaComparisonStatus = 'match' | 'mismatch' | 'not_provided'

export type GestoriaComparisonLine = {
  key: string
  label: string
  mediquoteValue: number | null
  gestoriaValue: number | null
  difference: number | null
  status: GestoriaComparisonStatus
}

export type InternalGasiCostLine = {
  key: string
  label: string
  amount: number
  ruleReference?: string | null
}

export type BudgetSealInput = {
  budgetId: string
  code: string
  version: number
  emittedAt: string
  client: unknown
  service: unknown
  serviceBlocks: unknown[]
  economicInputs: unknown
  internalEconomicConfig: unknown
  calculation: unknown
  engineVersion: string | null
}

export type CostAuditSealInput = {
  auditId: string
  budgetId: string
  budgetVersion: number
  auditVersion: number
  closedAt: string
  originalEconomicSnapshotHash: string
  gestoriaDocument: SourceDocumentFingerprint
  gestoriaValues: unknown
  comparison: GestoriaComparisonLine[]
  internalGasiCosts: InternalGasiCostLine[]
  reconciliationResult: unknown
  previousAuditArtifactHash?: string | null
}

function detachedCanonicalCopy<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T
}

function assertFiniteOrNull(value: number | null, field: string): void {
  if (value !== null && !Number.isFinite(value)) throw new TypeError(`${field} debe ser finito o null`)
}

function assertSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new TypeError(`${field} debe ser un SHA-256 hexadecimal`)
}

export function buildBudgetSealPayload(input: BudgetSealInput): CanonicalJson {
  if (!input.budgetId.trim() || !input.code.trim()) throw new TypeError('budgetId y code son obligatorios')
  if (!Number.isInteger(input.version) || input.version < 1) throw new TypeError('version debe ser >= 1')
  if (Number.isNaN(Date.parse(input.emittedAt))) throw new TypeError('emittedAt inválido')

  return detachedCanonicalCopy({
    budgetId: input.budgetId,
    code: input.code,
    version: input.version,
    emittedAt: new Date(input.emittedAt).toISOString(),
    client: input.client,
    service: input.service,
    serviceBlocks: input.serviceBlocks,
    economicInputs: input.economicInputs,
    internalEconomicConfig: input.internalEconomicConfig,
    calculation: input.calculation,
    engineVersion: input.engineVersion,
  }) as CanonicalJson
}

export function buildCostAuditSealPayload(input: CostAuditSealInput): CanonicalJson {
  if (!input.auditId.trim() || !input.budgetId.trim()) throw new TypeError('auditId y budgetId son obligatorios')
  if (!Number.isInteger(input.budgetVersion) || input.budgetVersion < 1) throw new TypeError('budgetVersion debe ser >= 1')
  if (!Number.isInteger(input.auditVersion) || input.auditVersion < 1) throw new TypeError('auditVersion debe ser >= 1')
  if (Number.isNaN(Date.parse(input.closedAt))) throw new TypeError('closedAt inválido')
  assertSha256(input.originalEconomicSnapshotHash, 'originalEconomicSnapshotHash')
  assertSha256(input.gestoriaDocument.sha256, 'gestoriaDocument.sha256')
  if (input.previousAuditArtifactHash) assertSha256(input.previousAuditArtifactHash, 'previousAuditArtifactHash')

  for (const [index, line] of input.comparison.entries()) {
    if (!line.key.trim() || !line.label.trim()) throw new TypeError(`comparison[${index}] sin identificador`)
    assertFiniteOrNull(line.mediquoteValue, `comparison[${index}].mediquoteValue`)
    assertFiniteOrNull(line.gestoriaValue, `comparison[${index}].gestoriaValue`)
    assertFiniteOrNull(line.difference, `comparison[${index}].difference`)

    if (line.status === 'not_provided' && line.gestoriaValue !== null) {
      throw new TypeError(`comparison[${index}] no puede ser not_provided con valor de gestoría`)
    }
    if (line.status !== 'not_provided' && (line.mediquoteValue === null || line.gestoriaValue === null || line.difference === null)) {
      throw new TypeError(`comparison[${index}] conciliado requiere ambos valores y diferencia`)
    }
  }

  for (const [index, line] of input.internalGasiCosts.entries()) {
    if (!line.key.trim() || !line.label.trim()) throw new TypeError(`internalGasiCosts[${index}] sin identificador`)
    if (!Number.isFinite(line.amount)) throw new TypeError(`internalGasiCosts[${index}].amount debe ser finito`)
  }

  return detachedCanonicalCopy({
    auditId: input.auditId,
    budgetId: input.budgetId,
    budgetVersion: input.budgetVersion,
    auditVersion: input.auditVersion,
    closedAt: new Date(input.closedAt).toISOString(),
    originalEconomicSnapshotHash: input.originalEconomicSnapshotHash,
    gestoriaDocument: input.gestoriaDocument,
    gestoriaValues: input.gestoriaValues,
    comparison: input.comparison,
    // Sección deliberadamente separada: estos importes completan el resultado económico,
    // pero nunca se contrastan con la gestoría.
    internalGasiCosts: input.internalGasiCosts,
    reconciliationResult: input.reconciliationResult,
    previousAuditArtifactHash: input.previousAuditArtifactHash ?? null,
  }) as CanonicalJson
}
