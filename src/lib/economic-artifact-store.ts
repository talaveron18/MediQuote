import type { Prisma } from '@prisma/client'
import { db } from './db'
import { buildImmutableArtifact, type ImmutableArtifact } from './immutable-artifact'

const BUDGET_ACTION = 'sealed_budget_artifact'
const AUDIT_ACTION = 'sealed_cost_audit_artifact'

type PayloadFactory = unknown | ((version: number) => unknown)
type SealCommon = {
  createdById: string
  payload: PayloadFactory
  createdAt?: Date
}

type BudgetArtifactClient = Pick<Prisma.TransactionClient, 'budgetHistory'>
type AuditArtifactClient = Pick<Prisma.TransactionClient, 'auditLog'>

function parseStoredArtifact(raw: string | null | undefined): ImmutableArtifact | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ImmutableArtifact
    return parsed && typeof parsed.artifactHash === 'string' ? parsed : null
  } catch {
    return null
  }
}

function resolvePayload(payload: PayloadFactory, version: number): unknown {
  return typeof payload === 'function' ? (payload as (version: number) => unknown)(version) : payload
}

export async function sealBudgetArtifactWithClient(
  client: BudgetArtifactClient,
  params: SealCommon & { budgetId: string },
): Promise<ImmutableArtifact> {
  const previousRows = await client.budgetHistory.findMany({
    where: { budgetId: params.budgetId, action: BUDGET_ACTION },
    orderBy: { createdAt: 'asc' },
    select: { snapshot: true },
  })
  const previous = parseStoredArtifact(previousRows.at(-1)?.snapshot)
  const version = previousRows.length + 1
  const artifact = buildImmutableArtifact({
    kind: 'budget',
    entityId: params.budgetId,
    version,
    createdAt: (params.createdAt ?? new Date()).toISOString(),
    createdById: params.createdById,
    previousArtifactHash: previous?.artifactHash ?? null,
    payload: resolvePayload(params.payload, version),
  })

  await client.budgetHistory.create({
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

export async function sealBudgetArtifact(params: SealCommon & { budgetId: string }): Promise<ImmutableArtifact> {
  return sealBudgetArtifactWithClient(db, params)
}

export async function sealCostAuditArtifactWithClient(
  client: AuditArtifactClient,
  params: SealCommon & {
    auditId: string
    sourceDocuments?: ImmutableArtifact['sourceDocuments']
  },
): Promise<ImmutableArtifact> {
  const previousRows = await client.auditLog.findMany({
    where: { action: AUDIT_ACTION, entity: 'cost_audit', entityId: params.auditId },
    orderBy: { createdAt: 'asc' },
    select: { newData: true },
  })
  const previous = parseStoredArtifact(previousRows.at(-1)?.newData)
  const version = previousRows.length + 1
  const artifact = buildImmutableArtifact({
    kind: 'cost_audit',
    entityId: params.auditId,
    version,
    createdAt: (params.createdAt ?? new Date()).toISOString(),
    createdById: params.createdById,
    previousArtifactHash: previous?.artifactHash ?? null,
    sourceDocuments: params.sourceDocuments ?? [],
    payload: resolvePayload(params.payload, version),
  })

  await client.auditLog.create({
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

export async function sealCostAuditArtifact(params: SealCommon & {
  auditId: string
  sourceDocuments?: ImmutableArtifact['sourceDocuments']
}): Promise<ImmutableArtifact> {
  return sealCostAuditArtifactWithClient(db, params)
}

export async function getLatestBudgetArtifact(budgetId: string): Promise<ImmutableArtifact | null> {
  const row = await db.budgetHistory.findFirst({
    where: { budgetId, action: BUDGET_ACTION },
    orderBy: { createdAt: 'desc' },
    select: { snapshot: true },
  })
  return parseStoredArtifact(row?.snapshot)
}
