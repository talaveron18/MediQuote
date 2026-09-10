export type CostingQuoteLike = {
  id: string
  userId: string
  usedAt: Date | null
  expiresAt: Date
  [key: string]: unknown
}

export type CostingQuoteClaimClient<TQuote extends CostingQuoteLike = CostingQuoteLike> = {
  costingQuote: {
    updateMany(args: unknown): Promise<{ count: number }>
    findUnique(args: unknown): Promise<TQuote | null>
  }
}

/**
 * Claims a costing quote exactly once.
 *
 * The update is the synchronization primitive: only one concurrent request can
 * change usedAt from NULL. A caller must execute this inside the same database
 * transaction as the budget write so a later failure rolls the claim back.
 */
export async function claimCostingQuote<TQuote extends CostingQuoteLike>(
  client: CostingQuoteClaimClient<TQuote>,
  userId: string,
  token: unknown,
  now = new Date(),
): Promise<TQuote | null> {
  if (typeof token !== 'string' || !token) return null

  const claimed = await client.costingQuote.updateMany({
    where: {
      id: token,
      userId,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { usedAt: now },
  })
  if (claimed.count !== 1) return null

  const quote = await client.costingQuote.findUnique({ where: { id: token } })
  if (!quote || quote.userId !== userId || quote.usedAt === null || quote.expiresAt <= now) return null
  return quote
}
