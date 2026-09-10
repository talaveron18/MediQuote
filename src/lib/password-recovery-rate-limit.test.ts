import { beforeEach, describe, expect, it, vi } from 'vitest'

const configs = new Map<string, string>()
const appConfig = {
  findUnique: vi.fn(async ({ where }: any) => {
    const value = configs.get(where.key)
    return value === undefined ? null : { key: where.key, value }
  }),
  upsert: vi.fn(async ({ where, create, update }: any) => {
    configs.set(where.key, configs.has(where.key) ? update.value : create.value)
    return { key: where.key, value: configs.get(where.key)! }
  }),
}

vi.mock('./db', () => ({
  db: {
    $transaction: vi.fn(async (callback: any) => callback({ appConfig })),
  },
}))

import {
  PASSWORD_RESET_IDENTIFIER_LIMIT,
  PASSWORD_RESET_RATE_WINDOW_MS,
  recordPasswordRecoveryAttempt,
} from './password-recovery-rate-limit'

describe('password recovery rate limit', () => {
  beforeEach(() => configs.clear())

  it('permite intentos dentro del límite y bloquea al superarlo', async () => {
    const now = new Date('2026-09-10T03:00:00Z')
    for (let i = 0; i < PASSWORD_RESET_IDENTIFIER_LIMIT; i += 1) {
      await expect(recordPasswordRecoveryAttempt('USER@example.com', '203.0.113.9', now)).resolves.toMatchObject({ allowed: true })
    }
    await expect(recordPasswordRecoveryAttempt('user@example.com', '203.0.113.9', now)).resolves.toMatchObject({
      allowed: false,
      identifierAllowed: false,
    })
  })

  it('reinicia la ventana al expirar', async () => {
    const start = new Date('2026-09-10T03:00:00Z')
    for (let i = 0; i < PASSWORD_RESET_IDENTIFIER_LIMIT; i += 1) {
      await recordPasswordRecoveryAttempt('user@example.com', '203.0.113.10', start)
    }
    const nextWindow = new Date(start.getTime() + PASSWORD_RESET_RATE_WINDOW_MS)
    await expect(recordPasswordRecoveryAttempt('user@example.com', '203.0.113.10', nextWindow)).resolves.toMatchObject({ allowed: true })
  })

  it('no persiste correo ni IP en claro', async () => {
    await recordPasswordRecoveryAttempt('secret@example.com', '198.51.100.77', new Date('2026-09-10T03:00:00Z'))
    const persisted = [...configs.entries()].map(([key, value]) => `${key}:${value}`).join('\n')
    expect(persisted).not.toContain('secret@example.com')
    expect(persisted).not.toContain('198.51.100.77')
  })
})
