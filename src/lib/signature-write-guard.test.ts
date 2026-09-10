import { describe, expect, it } from 'vitest'
import { claimPendingSignature } from './signature-write-guard'

describe('claimPendingSignature', () => {
  it('solo deja ganar a un doble clic concurrente', async () => {
    let status = 'pending'
    const client = {
      budgetSignatureRequest: {
        async updateMany(args: any) {
          if (status !== args.where.status) return { count: 0 }
          status = args.data.status
          return { count: 1 }
        },
      },
    }

    const [first, second] = await Promise.all([
      claimPendingSignature(client, 'sig-1', { signerName: 'Uno' }),
      claimPendingSignature(client, 'sig-1', { signerName: 'Dos' }),
    ])
    expect([first, second].filter(Boolean)).toHaveLength(1)
    expect(status).toBe('accepted')
  })
})
