import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { createPasswordRecoveryToken } from '../src/lib/password-recovery'

const db = new PrismaClient()
const originalPassword = 'Synthetic-Boundary-Original-2026!'
const resetPassword = 'Synthetic-Boundary-Reset-2026!'

async function createUser(label: string) {
  const suffix = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return db.user.create({
    data: {
      email: `${suffix}@example.invalid`,
      name: `E2E Boundary ${label}`,
      role: 'comercial',
      active: true,
      mustChangePassword: false,
      password: await hash(originalPassword, 12),
    },
  })
}

async function issueRecovery(userId: string) {
  const token = createPasswordRecoveryToken()
  await db.appConfig.create({
    data: {
      key: `password_reset:${token.tokenHash}`,
      value: JSON.stringify({
        userId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt.toISOString(),
        usedAt: null,
      }),
    },
  })
  return token.rawToken
}

async function cleanup(userId: string) {
  await db.appConfig.deleteMany({ where: { key: { startsWith: 'password_reset:' }, value: { contains: userId } } })
  await db.appConfig.deleteMany({ where: { key: `session_generation:${userId}` } })
  await db.auditLog.deleteMany({ where: { userId } })
  await db.user.deleteMany({ where: { id: userId } })
}

function rateKey(scope: 'identifier' | 'ip', value: string) {
  const digest = createHash('sha256').update(value).digest('hex')
  return `password_reset_rate:${scope}:${digest}`
}

test.describe.serial('límites de entrada de recuperación', () => {
  test.afterAll(async () => {
    await db.$disconnect()
  })

  test('correo malformado conserva respuesta genérica y no consume cuotas persistentes', async ({ request }) => {
    const malformed = `${'x'.repeat(300)}@example.invalid`
    const sourceIp = `198.51.100.${Math.floor(Math.random() * 100) + 100}`
    const identifierKey = rateKey('identifier', malformed.toLowerCase())
    const ipKey = rateKey('ip', sourceIp)

    await db.appConfig.deleteMany({ where: { key: { in: [identifierKey, ipKey] } } })
    const response = await request.post('/api/recovery/password/request', {
      data: { email: malformed },
      headers: { 'x-forwarded-for': sourceIp },
    })

    expect(response.status()).toBe(202)
    expect(response.headers()['cache-control']).toContain('no-store')
    expect(await db.appConfig.findUnique({ where: { key: identifierKey } })).toBeNull()
    expect(await db.appConfig.findUnique({ where: { key: ipKey } })).toBeNull()
  })

  test('contraseña de más de 72 bytes falla antes de consumir un token válido', async ({ request }) => {
    const user = await createUser('password-bytes')
    try {
      const token = await issueRecovery(user.id)
      const tooLong = '🔐'.repeat(19)
      const rejected = await request.post('/api/recovery/password/confirm', {
        data: { token, password: tooLong },
      })
      expect(rejected.status()).toBe(400)
      expect(rejected.headers()['cache-control']).toContain('no-store')

      const accepted = await request.post('/api/recovery/password/confirm', {
        data: { token, password: resetPassword },
      })
      expect(accepted.status()).toBe(200)
    } finally {
      await cleanup(user.id)
    }
  })

  test('token no canónico falla cerrado y no afecta a un enlace real pendiente', async ({ request }) => {
    const user = await createUser('token-shape')
    try {
      const token = await issueRecovery(user.id)
      const malformed = `${token.slice(0, 42)}!`
      const rejected = await request.post('/api/recovery/password/confirm', {
        data: { token: malformed, password: resetPassword },
      })
      expect(rejected.status()).toBe(400)
      expect(rejected.headers()['cache-control']).toContain('no-store')

      const accepted = await request.post('/api/recovery/password/confirm', {
        data: { token, password: resetPassword },
      })
      expect(accepted.status()).toBe(200)
    } finally {
      await cleanup(user.id)
    }
  })

  test('la UI aplica el mismo límite UTF-8 antes de enviar y permite corregir sin perder el enlace', async ({ page }) => {
    const user = await createUser('ui-policy')
    try {
      const token = await issueRecovery(user.id)
      await page.goto(`/restablecer-password?token=${encodeURIComponent(token)}`)
      const tooLong = '🔐'.repeat(19)
      await page.locator('#password').fill(tooLong)
      await page.locator('#confirmation').fill(tooLong)
      await page.getByRole('button', { name: 'Actualizar contraseña' }).click()
      await expect(page.getByRole('alert')).toContainText('72 bytes')

      await page.locator('#password').fill(resetPassword)
      await page.locator('#confirmation').fill(resetPassword)
      await page.getByRole('button', { name: 'Actualizar contraseña' }).click()
      await expect(page.getByRole('status')).toContainText('Contraseña actualizada')
    } finally {
      await cleanup(user.id)
    }
  })
})
