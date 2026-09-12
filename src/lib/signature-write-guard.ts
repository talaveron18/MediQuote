import { hashBudgetForSignature } from './budget-signature'

export function signatureDocumentIsCurrent(budget: unknown, expectedHash: string): boolean {
  return hashBudgetForSignature(budget as any) === expectedHash
}

export type PendingSignatureClaimClient = {
  budgetSignatureRequest: {
    updateMany(args: any): Promise<{ count: number }>
  }
}

export type PendingSignatureRevocationClient = PendingSignatureClaimClient & {
  budgetSignatureRequest: {
    findMany(args: any): Promise<Array<{ id: string; documentHash: string }>>
    updateMany(args: any): Promise<{ count: number }>
  }
}

/**
 * Atomically moves one signature request out of pending state.
 * Run inside the same DB transaction as the accepted-budget status change.
 */
export async function claimPendingSignature(
  client: PendingSignatureClaimClient,
  id: string,
  acceptedData: Record<string, unknown>,
): Promise<boolean> {
  const result = await client.budgetSignatureRequest.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'accepted', ...acceptedData },
  })
  return result.count === 1
}

/**
 * Revokes only pending requests whose signed document hash no longer matches
 * the persisted budget. This lets workflow/internal-only edits coexist with a
 * valid signing link while making signed-content changes fail closed in the
 * same transaction as the budget mutation.
 */
export async function revokeStalePendingSignatures(
  client: PendingSignatureRevocationClient,
  budget: unknown & { id?: string },
): Promise<number> {
  const budgetId = (budget as any)?.id
  if (!budgetId) return 0

  const pending = await client.budgetSignatureRequest.findMany({
    where: { budgetId, status: 'pending' },
    select: { id: true, documentHash: true },
  })
  const staleIds = pending
    .filter((request) => !signatureDocumentIsCurrent(budget, request.documentHash))
    .map((request) => request.id)
  if (!staleIds.length) return 0

  const result = await client.budgetSignatureRequest.updateMany({
    where: { id: { in: staleIds }, status: 'pending' },
    data: { status: 'revoked' },
  })
  return result.count
}

/** Revokes every pending request for a budget when its lifecycle is closed. */
export async function revokeAllPendingSignatures(
  client: PendingSignatureClaimClient,
  budgetId: string,
): Promise<number> {
  const result = await client.budgetSignatureRequest.updateMany({
    where: { budgetId, status: 'pending' },
    data: { status: 'revoked' },
  })
  return result.count
}
