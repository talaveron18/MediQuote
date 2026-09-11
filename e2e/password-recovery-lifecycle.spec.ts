import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { createPasswordRecoveryToken } from '../src/lib/password-recovery'

const db = new PrismaClient()
const originalPassword = 'Synthetic-Recovery-Original-2026!'
const resetPassword = 'Synthetic-Recovery-Reset-2026!'
const changedPassword = 'Synthetic-Recovery-Changed-2026!'

async function createRecoveryUser(label: string) {
  const suffix = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return db.user.create({
    data: {
      email: `${suffix}@example.invalid`,
      name: `E2E Recovery ${label}`,
      role: 'comercial',
      active: true,
      mustChangePassword: false,
      password: await hash(originalPassword, 12),
    },
  })
}

async function issueRecovery(userId: string, expiresAt = new Date(Date.now() + 20 * 60_000)) {
  const token = createPasswordRecoveryToken(new Date(), expiresAt.getTime() - Date.now())
  await db.appConfig.create({
    data: {
      key: `password_reset:${token.tokenHash}`,
      value: JSON.stringify({
        userId,
        tokenHash: token.tokenHash,
        expiresAt: expiresAt.toISOString(),
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

async function login(request: any, email: string, password: string) {
  return request.post('/api/auth', { data: { email, password } })
}

test.describe.serial('recuperación de contraseña aislada', () => {
  test.afterAll(async () => {
    await db.$disconnect()
  })

  test('no enumera cuentas y mantiene privada la respuesta de solicitud', async ({ request }) => {
    const user = await createRecoveryUser('anti-enum')
    try {
      const known = await request.post('/api/recovery/password/request', { data: { email: `  ${user.email.toUpperCase()}  ` } })
      const unknown = await request.post('/api/recovery/password/request', { data: { email: 'missing-recovery-user@example.invalid' } })

      expect(known.status()).toBe(202)
      expect(unknown.status()).toBe(202)
      expect(await known.json()).toEqual(await unknown.json())
      expect(known.headers()['cache-control']).toContain('no-store')
      expect(unknown.headers()['cache-control']).toContain('no-store')

      // Delivery is intentionally unconfigured in isolated QA; fail-closed must
      // leave no usable reset record behind for the known account.
      const rows = await db.appConfig.findMany({ where: { key: { startsWith: 'password_reset:' } } })
      const owned = rows.map((row) => row.value).filter((value) => value.includes(user.id))
      expect(owned.length).toBeGreaterThan(0)
      expect(owned.every((value) => JSON.parse(value).usedAt !== null)).toBe(true)
    } finally {
      await cleanup(user.id)
    }
  })

  test('reset válido es de un solo uso, revoca sesión anterior y cambia las credenciales', async ({ browser, page }) => {
    const user = await createRecoveryUser('single-use')
    try {
      const oldContext = await browser.newContext()
      const oldLogin = await login(oldContext.request, user.email, originalPassword)
      expect(oldLogin.ok()).toBe(true)

      const token = await issueRecovery(user.id)
      await page.goto(`/restablecer-password?token=${encodeURIComponent(token)}`)
      await page.locator('#password').fill(resetPassword)
      await page.locator('#confirmation').fill(resetPassword)
      await page.getByRole('button', { name: 'Actualizar contraseña' }).click()
      await expect(page.getByRole('status')).toContainText('sesiones anteriores han sido revocadas')

      const staleSession = await oldContext.request.get('/api/auth?action=me')
      expect(staleSession.status()).toBe(401)
      await oldContext.close()

      const oldPasswordLogin = await login(page.request, user.email, originalPassword)
      expect(oldPasswordLogin.status()).toBe(401)
      const newPasswordLogin = await login(page.request, user.email, resetPassword)
      expect(newPasswordLogin.ok()).toBe(true)

      const replay = await page.request.post('/api/recovery/password/confirm', {
        data: { token, password: 'Synthetic-Recovery-Replay-2026!' },
      })
      expect(replay.status()).toBe(400)
      expect(replay.headers()['cache-control']).toContain('no-store')
    } finally {
      await cleanup(user.id)
    }
  })

  test('cambio autenticado invalida un enlace de recuperación pendiente y revoca otras sesiones', async ({ browser }) => {
    const user = await createRecoveryUser('change-revokes')
    try {
      const contextA = await browser.newContext()
      const contextB = await browser.newContext()
      expect((await login(contextA.request, user.email, originalPassword)).ok()).toBe(true)
      expect((await login(contextB.request, user.email, originalPassword)).ok()).toBe(true)
      const token = await issueRecovery(user.id)

      const changed = await contextA.request.post('/api/auth?action=change-password', {
        data: { currentPassword: originalPassword, newPassword: changedPassword },
      })
      expect(changed.ok()).toBe(true)
      expect(changed.headers()['cache-control']).toContain('no-store')

      expect((await contextA.request.get('/api/auth?action=me')).ok()).toBe(true)
      expect((await contextB.request.get('/api/auth?action=me')).status()).toBe(401)

      const revokedLink = await contextA.request.post('/api/recovery/password/confirm', {
        data: { token, password: resetPassword },
      })
      expect(revokedLink.status()).toBe(400)
      await contextA.close()
      await contextB.close()
    } finally {
      await cleanup(user.id)
    }
  })

  test('token caducado falla cerrado sin modificar contraseña', async ({ request }) => {
    const user = await createRecoveryUser('expired')
    try {
      const token = createPasswordRecoveryToken(new Date(Date.now() - 30 * 60_000), 5 * 60_000)
      await db.appConfig.create({
        data: {
          key: `password_reset:${token.tokenHash}`,
          value: JSON.stringify({
            userId: user.id,
            tokenHash: token.tokenHash,
            expiresAt: token.expiresAt.toISOString(),
            usedAt: null,
          }),
        },
      })

      const response = await request.post('/api/recovery/password/confirm', {
        data: { token: token.rawToken, password: resetPassword },
      })
      expect(response.status()).toBe(400)
      expect(response.headers()['cache-control']).toContain('no-store')
      expect((await login(request, user.email, originalPassword)).ok()).toBe(true)
      expect((await login(request, user.email, resetPassword)).status()).toBe(401)
    } finally {
      await cleanup(user.id)
    }
  })
})
