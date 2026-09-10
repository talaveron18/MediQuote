import { db } from './db'
import { buildImmutableArtifact, type ImmutableArtifact } from './immutable-artifact'

const BUDGET_ACTION = 'sealed_budget_artifact'
const AUDIT_ACTION = 'sealed_cost_audit_artifact'

type SealCommon = {
  createdById: string
  payload: unknown
  createdAt?: Date
}

function parseStoredArtifact(raw: string | null | undefined): ImmutableArtifact | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ImmutableArtifact
    return parsed && typeof parsed.artifactHash === 'string' ? parsed : null
  } catch {
    return null
  }
}

export async function sealBudgetArtifact(params: SealCommon & { budgetId: string }): Promise<ImmutableArtifact> {
  const previousRows = await db.budgetHistory.findMany({
    where: { budgetId: params.budgetId, action: BUDGET_ACTION },
    orderBy: { createdAt: 'asc' },
    select: { snapshot: true },
  })
  const previous = parseStoredArtifact(previousRows.at(-1)?.snapshot)
  const artifact = buildImmutableArtifact({
    kind: 'budget',
    entityId: params.budgetId,
    version: previousRows.length + 1,
    createdAt: (params.createdAt ?? new Date()).toISOString(),
    createdById: params.createdById,
    previousArtifactHash: previous?.artifactHash ?? null,
    payload: params.payload,
  })

  await db.budgetHistory.create({
    data: {
      budgetId: params.budgetId,
      userId: params.createdById,
      action: BUDGET_ACTION,
      snapshot: JSON.stringify(artifact),
      notes: `immutable:${artifact.artifactHash}`,
    },
  })
  return artifact
}

export async function sealCostAuditArtifact(params: SealCommon & {
  auditId: string
  sourceDocuments?: ImmutableArtifact['sourceDocuments']
}): Promise<ImmutableArtifact> {
  const previousRows = await db.auditLog.findMany({
    where: { action: AUDIT_ACTION, entity: 'cost_audit', entityId: params.auditId },
    orderBy: { createdAt: 'asc' },
    select: { newData: true },
  })
  const previous = parseStoredArtifact(previousRows.at(-1)?.newData)
  const artifact = buildImmutableArtifact({
    kind: 'cost_audit',
    entityId: params.auditId,
    version: previousRows.length + 1,
    createdAt: (params.createdAt ?? new Date()).toISOString(),
    createdById: params.createdById,
    previousArtifactHash: previous?.artifactHash ?? null,
    sourceDocuments: params.sourceDocuments ?? [],
    payload: params.payload,
  })

  await db.auditLog.create({
    data: {
      action: AUDIT_ACTION,
      entity: 'cost_audit',
      entityId: params.auditId,
      userId: params.createdById,
      summary: `Fotografía inmutable auditoría v${artifact.version}`,
      newData: JSON.stringify(artifact),
      result: 'success',
    },
  })
  return artifact
}

export async function getLatestBudgetArtifact(budgetId: string): Promise<ImmutableArtifact | null> {
  const row = await db.budgetHistory.findFirst({
    where: { budgetId, action: BUDGET_ACTION },
    orderBy: { createdAt: 'desc' },
    select: { snapshot: true },
  })
  return parseStoredArtifact(row?.snapshot)
}
