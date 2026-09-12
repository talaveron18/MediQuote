import type { Prisma } from '@prisma/client'
import { db } from './db'
import { buildImmutableArtifact, canonicalJson, type ImmutableArtifact } from './immutable-artifact'

const BUDGET_ACTION = 'sealed_budget_artifact'
const AUDIT_ACTION = 'sealed_cost_audit_artifact'
const SIGNATURE_REVOCATION_ACTION = 'signature_requests_revoked'

type PayloadFactory = unknown | ((version: number) => unknown)
type SealCommon = {
  createdById: string
  payload: PayloadFactory
  createdAt?: Date
}

type BudgetArtifactClient = Pick<Prisma.TransactionClient, 'budgetHistory' | 'budgetSignatureRequest'>
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

function parseArtifactPayload(artifact: ImmutableArtifact | null): Record<string, any> | null {
  if (!artifact?.payloadCanonical) return null
  try {
    const parsed = JSON.parse(artifact.payloadCanonical)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : null
  } catch {
    return null
  }
}

function nullable(value: unknown): unknown {
  return value === undefined ? null : value
}

/**
 * Projection of the immutable budget artifact that corresponds to the fields
 * accepted by the customer signature. Workflow-only and internal fields are
 * deliberately excluded so they cannot revoke a valid pending signature.
 */
export function signableProjectionFromBudgetArtifactPayload(payload: Record<string, any>): unknown {
  const service = payload.service && typeof payload.service === 'object' ? payload.service : {}
  const location = service.location && typeof service.location === 'object' ? service.location : {}
  const calculation = payload.calculation && typeof payload.calculation === 'object' ? payload.calculation : {}
  const client = payload.client && typeof payload.client === 'object' ? payload.client : null
  const blocks = Array.isArray(payload.serviceBlocks) ? payload.serviceBlocks : []

  return {
    id: nullable(payload.budgetId),
    code: nullable(payload.code),
    clientId: nullable(client?.id),
    // borrador/enviado/aceptado son estados de workflow. Caducado, en cambio,
    // cierra la posibilidad de aceptación y debe revocar enlaces pendientes en
    // la misma transacción que sella el nuevo artefacto.
    lifecycleClosed: service.status === 'caducado',
    validUntil: nullable(service.validUntil),
    description: nullable(service.description),
    subtotal: nullable(calculation.subtotal),
    discountPercent: nullable(calculation.discountPercent),
    discountAmount: nullable(calculation.discountAmount),
    ivaAmount: nullable(calculation.ivaAmount),
    totalFinal: nullable(calculation.totalFinal),
    serviceLocationId: nullable(location.id),
    serviceAutonomousCommunity: nullable(location.autonomousCommunity),
    serviceProvince: nullable(location.province),
    serviceMunicipality: nullable(location.municipality),
    client: client ? {
      businessName: nullable(client.businessName),
      cif: nullable(client.cif),
      fiscalAddress: nullable(client.fiscalAddress),
      email: nullable(client.email),
    } : null,
    serviceBlocks: blocks.map((block: Record<string, any>) => ({
      serviceName: nullable(block.serviceName),
      professionalCategory: nullable(block.professionalCategory),
      specificDates: nullable(block.specificDates),
      dateRangeStart: nullable(block.dateRangeStart),
      dateRangeEnd: nullable(block.dateRangeEnd),
      shiftType: nullable(block.shiftType),
      shiftStartTime: nullable(block.shiftStartTime),
      shiftEndTime: nullable(block.shiftEndTime),
      totalWorkingDays: nullable(block.totalWorkingDays),
      totalHours: nullable(block.totalHours),
      blockClosingPrice: nullable(block.blockClosingPrice),
      ivaPercent: nullable(block.ivaPercent),
      ivaAmount: nullable(block.ivaAmount),
      blockTotalFinal: nullable(block.blockTotalFinal),
    })),
  }
}

export function budgetArtifactChangesSignableDocument(
  previous: ImmutableArtifact | null,
  next: ImmutableArtifact,
): boolean {
  const previousPayload = parseArtifactPayload(previous)
  const nextPayload = parseArtifactPayload(next)
  if (!previousPayload || !nextPayload) return false
  return canonicalJson(signableProjectionFromBudgetArtifactPayload(previousPayload))
    !== canonicalJson(signableProjectionFromBudgetArtifactPayload(nextPayload))
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

  if (budgetArtifactChangesSignableDocument(previous, artifact)) {
    const revoked = await client.budgetSignatureRequest.updateMany({
      where: { budgetId: params.budgetId, status: 'pending' },
      data: { status: 'revoked' },
    })
    if (revoked.count > 0) {
      await client.budgetHistory.create({
        data: {
          budgetId: params.budgetId,
          userId: params.createdById,
          action: SIGNATURE_REVOCATION_ACTION,
          notes: `reason=signable_document_changed;count=${revoked.count}`,
        },
      })
    }
  }

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
