import { hashBudgetForSignature } from './budget-signature'

export function signatureDocumentIsCurrent(budget: unknown, expectedHash: string): boolean {
  return hashBudgetForSignature(budget as any) === expectedHash
}

export type PendingSignatureClaimClient = {
  budgetSignatureRequest: {
    updateMany(args: unknown): Promise<{ count: number }>
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
