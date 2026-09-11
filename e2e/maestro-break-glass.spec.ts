import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { compare, hash } from 'bcryptjs'
import { createStoredPasswordRecovery } from '../src/lib/password-recovery-store'

const db = new PrismaClient()
const maestroEmail = 'e2e.maestro@example.invalid'
const passwordA = 'Synthetic-Maestro-BreakGlass-A-2026!'
const passwordB = 'Synthetic-Maestro-BreakGlass-B-2026!'

function requiredEnv(name: 'GASI_MAESTRO_RECOVERY_SECRET' | 'E2E_MAESTRO_PASSWORD') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} missing from isolated E2E environment`)
  return value
}

test.describe.serial('Maestro break-glass aislado', () => {
  test.afterAll(async () => {
    await db.$disconnect()
  })

  test('es single-use y atómico, revoca recovery/sesiones y no filtra secretos en auditoría', async ({ request }) => {
    const secret = requiredEnv('GASI_MAESTRO_RECOVERY_SECRET')
    const originalPassword = requiredEnv('E2E_MAESTRO_PASSWORD')
    const fingerprint = createHash('sha256').update(secret).digest('hex')
    const maestro = await db.user.findUniqueOrThrow({ where: { email: maestroEmail } })

    await db.appConfig.deleteMany({ where: { key: 'maestro_recovery_used_fingerprint' } })
    await db.appConfig.deleteMany({ where: { key: `session_generation:${maestro.id}` } })
    await db.appConfig.deleteMany({ where: { key: { startsWith: 'password_reset:' }, value: { contains: maestro.id } } })
    await db.auditLog.deleteMany({ where: { action: 'maestro_password_recovered' } })

    const pending = await createStoredPasswordRecovery(maestroEmail)
    expect(pending).not.toBeNull()
    const generationBefore = 1

    try {
      const headers = { 'x-gasi-recovery-key': secret }
      const [first, second] = await Promise.all([
        request.post('/api/recovery/maestro', { headers, data: { password: passwordA } }),
        request.post('/api/recovery/maestro', { headers, data: { password: passwordB } }),
      ])
      expect([first.status(), second.status()].sort()).toEqual([200, 409])
      expect(first.headers()['cache-control']).toContain('no-store')
      expect(second.headers()['cache-control']).toContain('no-store')

      const persisted = await db.user.findUniqueOrThrow({ where: { id: maestro.id } })
      const aWon = await compare(passwordA, persisted.password)
      const bWon = await compare(passwordB, persisted.password)
      expect(Number(aWon) + Number(bWon)).toBe(1)
      expect(persisted.mustChangePassword).toBe(true)

      const generation = await db.appConfig.findUnique({ where: { key: `session_generation:${maestro.id}` } })
      expect(Number(generation?.value)).toBe(generationBefore + 1)

      const ordinaryResetRows = await db.appConfig.findMany({
        where: { key: { startsWith: 'password_reset:' }, value: { contains: maestro.id } },
      })
      expect(ordinaryResetRows.length).toBeGreaterThan(0)
      expect(ordinaryResetRows.every((row) => JSON.parse(row.value).usedAt !== null)).toBe(true)

      const staleReset = await request.post('/api/recovery/password/confirm', {
        data: { token: pending!.rawToken, password: 'Synthetic-Stale-Reset-2026!' },
      })
      expect(staleReset.status()).toBe(400)

      const replay = await request.post('/api/recovery/maestro', {
        headers,
        data: { password: 'Synthetic-Maestro-Replay-2026!' },
      })
      expect(replay.status()).toBe(409)

      const usedFingerprint = await db.appConfig.findUnique({ where: { key: 'maestro_recovery_used_fingerprint' } })
      expect(usedFingerprint?.value).toBe(fingerprint)

      const auditRows = await db.auditLog.findMany({ where: { action: 'maestro_password_recovered' } })
      expect(auditRows).toHaveLength(1)
      const auditPayload = JSON.stringify(auditRows[0])
      for (const forbidden of [secret, fingerprint, passwordA, passwordB, pending!.rawToken, maestroEmail]) {
        expect(auditPayload).not.toContain(forbidden)
      }
      expect(auditRows[0].summary).toContain('sesiones anteriores revocadas')
    } finally {
      await db.user.update({
        where: { id: maestro.id },
        data: { password: await hash(originalPassword, 12), mustChangePassword: false },
      })
      await db.appConfig.deleteMany({ where: { key: 'maestro_recovery_used_fingerprint' } })
      await db.appConfig.deleteMany({ where: { key: `session_generation:${maestro.id}` } })
      await db.appConfig.deleteMany({ where: { key: { startsWith: 'password_reset:' }, value: { contains: maestro.id } } })
      await db.auditLog.deleteMany({ where: { action: 'maestro_password_recovered' } })
    }
  })
})
