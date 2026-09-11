import { expect, test, type APIResponse, type BrowserContext, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { createPasswordRecoveryToken } from '../src/lib/password-recovery'
import { createStoredPasswordRecovery } from '../src/lib/password-recovery-store'

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

async function apiLogin(request: any, email: string, password: string) {
  return request.post('/api/auth', { data: { email, password } })
}

async function loginPage(context: BrowserContext, email: string, password: string) {
  const page = await context.newPage()
  await page.goto('/login')
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true')
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL('/')
  return page
}

async function browserPost(page: Page, path: string, body: unknown) {
  return page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return {
      status: response.status,
      ok: response.ok,
      cacheControl: response.headers.get('cache-control') ?? '',
      body: await response.json().catch(() => null),
    }
  }, { path, body })
}

async function browserGet(page: Page, path: string) {
  return page.evaluate(async (path) => {
    const response = await fetch(path, { credentials: 'same-origin' })
    return { status: response.status, ok: response.ok }
  }, path)
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

      const rows = await db.appConfig.findMany({ where: { key: { startsWith: 'password_reset:' } } })
      const owned = rows.map((row) => row.value).filter((value) => value.includes(user.id))
      expect(owned.length).toBeGreaterThan(0)
      expect(owned.every((value) => JSON.parse(value).usedAt !== null)).toBe(true)
    } finally {
      await cleanup(user.id)
    }
  })

  test('segunda solicitud invalida la primera y solo el enlace más reciente puede consumirse', async ({ request }) => {
    const user = await createRecoveryUser('superseded')
    try {
      const first = await createStoredPasswordRecovery(user.email)
      expect(first).not.toBeNull()
      const second = await createStoredPasswordRecovery(user.email)
      expect(second).not.toBeNull()

      const stale = await request.post('/api/recovery/password/confirm', {
        data: { token: first!.rawToken, password: resetPassword },
      })
      expect(stale.status()).toBe(400)
      expect((await apiLogin(request, user.email, originalPassword)).ok()).toBe(true)

      const current = await request.post('/api/recovery/password/confirm', {
        data: { token: second!.rawToken, password: resetPassword },
      })
      expect(current.status()).toBe(200)
      expect((await apiLogin(request, user.email, originalPassword)).status()).toBe(401)
      expect((await apiLogin(request, user.email, resetPassword)).ok()).toBe(true)
    } finally {
      await cleanup(user.id)
    }
  })

  test('rate limiting mantiene respuesta genérica y evita emitir un sexto token por identificador', async ({ request }) => {
    const user = await createRecoveryUser('rate-limit')
    try {
      const headers = { 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 200) + 1}` }
      const responses: APIResponse[] = []
      for (let index = 0; index < 6; index += 1) {
        responses.push(await request.post('/api/recovery/password/request', {
          data: { email: user.email },
          headers,
        }))
      }

      const bodies = await Promise.all(responses.map((response) => response.json()))
      expect(responses.every((response) => response.status() === 202)).toBe(true)
      expect(bodies.every((body) => JSON.stringify(body) === JSON.stringify(bodies[0]))).toBe(true)
      expect(responses.every((response) => response.headers()['cache-control']?.includes('no-store'))).toBe(true)

      const owned = await db.appConfig.findMany({
        where: { key: { startsWith: 'password_reset:' }, value: { contains: user.id } },
      })
      expect(owned).toHaveLength(5)
      expect(owned.every((row) => JSON.parse(row.value).usedAt !== null)).toBe(true)
    } finally {
      await cleanup(user.id)
    }
  })

  test('entradas débiles o malformadas fallan cerrado sin consumir un token válido', async ({ request }) => {
    const user = await createRecoveryUser('malformed')
    try {
      const token = await issueRecovery(user.id)
      const weak = await request.post('/api/recovery/password/confirm', {
        data: { token, password: 'short' },
      })
      expect(weak.status()).toBe(400)
      expect(weak.headers()['cache-control']).toContain('no-store')

      const malformedConfirm = await request.post('/api/recovery/password/confirm', {
        data: { token: 12345, password: [] },
      })
      expect(malformedConfirm.status()).toBe(400)
      expect(malformedConfirm.headers()['cache-control']).toContain('no-store')

      const malformedRequest = await request.post('/api/recovery/password/request', {
        headers: { 'Content-Type': 'application/json' },
        data: '{',
      })
      expect(malformedRequest.status()).toBe(202)
      expect(malformedRequest.headers()['cache-control']).toContain('no-store')

      const valid = await request.post('/api/recovery/password/confirm', {
        data: { token, password: resetPassword },
      })
      expect(valid.status()).toBe(200)
      expect((await apiLogin(request, user.email, resetPassword)).ok()).toBe(true)
    } finally {
      await cleanup(user.id)
    }
  })

  test('reset válido es de un solo uso, revoca sesión anterior y cambia las credenciales', async ({ browser, page }) => {
    const user = await createRecoveryUser('single-use')
    try {
      const oldContext = await browser.newContext()
      const oldPage = await loginPage(oldContext, user.email, originalPassword)
      expect((await browserGet(oldPage, '/api/auth?action=me')).ok).toBe(true)

      const token = await issueRecovery(user.id)
      await page.goto(`/restablecer-password?token=${encodeURIComponent(token)}`)
      await page.locator('#password').fill(resetPassword)
      await page.locator('#confirmation').fill(resetPassword)
      await page.getByRole('button', { name: 'Actualizar contraseña' }).click()
      await expect(page.getByRole('status')).toContainText('sesiones anteriores han sido revocadas')

      expect((await browserGet(oldPage, '/api/auth?action=me')).status).toBe(401)
      await oldContext.close()

      const oldPasswordLogin = await apiLogin(page.request, user.email, originalPassword)
      expect(oldPasswordLogin.status()).toBe(401)
      const newPasswordLogin = await apiLogin(page.request, user.email, resetPassword)
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
      const pageA = await loginPage(contextA, user.email, originalPassword)
      const pageB = await loginPage(contextB, user.email, originalPassword)
      expect((await browserGet(pageA, '/api/auth?action=me')).ok).toBe(true)
      expect((await browserGet(pageB, '/api/auth?action=me')).ok).toBe(true)
      const token = await issueRecovery(user.id)

      const changed = await browserPost(pageA, '/api/auth?action=change-password', {
        currentPassword: originalPassword,
        newPassword: changedPassword,
      })
      expect(changed.ok, JSON.stringify(changed.body)).toBe(true)
      expect(changed.cacheControl).toContain('no-store')

      expect((await browserGet(pageA, '/api/auth?action=me')).ok).toBe(true)
      expect((await browserGet(pageB, '/api/auth?action=me')).status).toBe(401)

      const revokedLink = await browserPost(pageA, '/api/recovery/password/confirm', {
        token,
        password: resetPassword,
      })
      expect(revokedLink.status).toBe(400)
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
      expect((await apiLogin(request, user.email, originalPassword)).ok()).toBe(true)
      expect((await apiLogin(request, user.email, resetPassword)).status()).toBe(401)
    } finally {
      await cleanup(user.id)
    }
  })
})
