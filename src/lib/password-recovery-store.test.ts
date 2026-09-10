import { beforeEach, describe, expect, it, vi } from 'vitest'

const configs = new Map<string, string>()
let activeUser = { id: 'u-1', active: true }

const appConfig = {
  create: vi.fn(async ({ data }: any) => {
    if (configs.has(data.key)) throw new Error('duplicate')
    configs.set(data.key, data.value)
    return data
  }),
  findUnique: vi.fn(async ({ where }: any) => {
    const value = configs.get(where.key)
    return value === undefined ? null : { key: where.key, value }
  }),
  findMany: vi.fn(async ({ where }: any) => {
    const prefix = where?.key?.startsWith ?? ''
    return [...configs.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({ key, value }))
  }),
  updateMany: vi.fn(async ({ where, data }: any) => {
    if (configs.get(where.key) !== where.value) return { count: 0 }
    configs.set(where.key, data.value)
    return { count: 1 }
  }),
  upsert: vi.fn(async ({ where, create, update }: any) => {
    configs.set(where.key, configs.has(where.key) ? update.value : create.value)
    return { key: where.key, value: configs.get(where.key)! }
  }),
}

vi.mock('./db', () => ({
  db: {
    user: { findUnique: vi.fn(async () => activeUser) },
    appConfig,
    $transaction: vi.fn(async (callback: any) => callback({ appConfig })),
  },
}))

import {
  bumpSessionGeneration,
  consumeStoredPasswordRecovery,
  createStoredPasswordRecovery,
  getSessionGeneration,
} from './password-recovery-store'

describe('password recovery store', () => {
  beforeEach(() => {
    configs.clear()
    activeUser = { id: 'u-1', active: true }
  })

  it('persiste solo el hash y permite consumir el token una sola vez', async () => {
    const issued = await createStoredPasswordRecovery(' USER@example.com ', new Date('2026-09-10T01:00:00Z'))
    expect(issued).not.toBeNull()
    const rawToken = issued!.rawToken
    const storedText = [...configs.values()].join('\n')
    expect(storedText).not.toContain(rawToken)

    await expect(consumeStoredPasswordRecovery(rawToken, new Date('2026-09-10T01:05:00Z'))).resolves.toBe('u-1')
    await expect(consumeStoredPasswordRecovery(rawToken, new Date('2026-09-10T01:06:00Z'))).resolves.toBeNull()
  })

  it('una segunda solicitud invalida el token anterior no usado', async () => {
    const first = await createStoredPasswordRecovery('user@example.com', new Date('2026-09-10T01:00:00Z'))
    const second = await createStoredPasswordRecovery('user@example.com', new Date('2026-09-10T01:01:00Z'))
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()

    await expect(consumeStoredPasswordRecovery(first!.rawToken, new Date('2026-09-10T01:02:00Z'))).resolves.toBeNull()
    await expect(consumeStoredPasswordRecovery(second!.rawToken, new Date('2026-09-10T01:03:00Z'))).resolves.toBe('u-1')
  })

  it('no crea registro para una cuenta inactiva/inexistente', async () => {
    activeUser = { id: 'u-1', active: false }
    await expect(createStoredPasswordRecovery('nobody@example.com')).resolves.toBeNull()
    expect(configs.size).toBe(0)
  })

  it('incrementa la generación de sesión para invalidar cookies anteriores', async () => {
    await expect(getSessionGeneration('u-1')).resolves.toBe(1)
    await expect(bumpSessionGeneration('u-1')).resolves.toBe(2)
    await expect(getSessionGeneration('u-1')).resolves.toBe(2)
    await expect(bumpSessionGeneration('u-1')).resolves.toBe(3)
  })
})
