import { describe, expect, it } from 'vitest'
import { claimCostingQuote, type CostingQuoteLike } from './single-use-quote'

function fakeClient(initial: CostingQuoteLike) {
  const quote = { ...initial }
  return {
    costingQuote: {
      async updateMany(args: any) {
        const where = args.where
        const eligible = quote.id === where.id
          && quote.userId === where.userId
          && quote.usedAt === null
          && quote.expiresAt > where.expiresAt.gt
        if (!eligible) return { count: 0 }
        quote.usedAt = args.data.usedAt
        return { count: 1 }
      },
      async findUnique() { return { ...quote } },
    },
  }
}

describe('claimCostingQuote', () => {
  it('permite un único consumo aunque dos guardados compitan', async () => {
    const now = new Date('2026-09-10T07:00:00.000Z')
    const client = fakeClient({
      id: 'quote-1', userId: 'user-1', usedAt: null,
      expiresAt: new Date('2026-09-10T08:00:00.000Z'),
    })

    const [first, second] = await Promise.all([
      claimCostingQuote(client, 'user-1', 'quote-1', now),
      claimCostingQuote(client, 'user-1', 'quote-1', now),
    ])

    expect([first, second].filter(Boolean)).toHaveLength(1)
  })

  it('rechaza usuario ajeno, token vacío y cotización caducada', async () => {
    const now = new Date('2026-09-10T07:00:00.000Z')
    const client = fakeClient({
      id: 'quote-1', userId: 'user-1', usedAt: null,
      expiresAt: new Date('2026-09-10T06:59:59.000Z'),
    })
    expect(await claimCostingQuote(client, 'user-2', 'quote-1', now)).toBeNull()
    expect(await claimCostingQuote(client, 'user-1', '', now)).toBeNull()
    expect(await claimCostingQuote(client, 'user-1', 'quote-1', now)).toBeNull()
  })
})
