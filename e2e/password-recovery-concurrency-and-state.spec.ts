import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { createStoredPasswordRecovery, consumeStoredPasswordRecovery } from '../src/lib/password-recovery-store'

const db = new PrismaClient()
const originalPassword = 'Synthetic-Recovery-Concurrency-Original-2026!'
const resetPasswordA = 'Synthetic-Recovery-Concurrency-A-2026!'
const resetPasswordB = 'Synthetic-Recovery-Concurrency-B-2026!'

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

async function cleanup(userId: string) {
  await db.appConfig.deleteMany({ where: { key: { startsWith: 'password_reset:' }, value: { contains: userId } } })
  await db.appConfig.deleteMany({ where: { key: { in: [
    `session_generation:${userId}`,
    `password_recovery_issue_generation:${userId}`,
  ] } } })
  await db.auditLog.deleteMany({ where: { userId } })
  await db.user.deleteMany({ where: { id: userId } })
}

async function apiLogin(request: any, email: string, password: string) {
  return request.post('/api/auth', { data: { email, password } })
}

test.describe.serial('recuperación: concurrencia y cambios de estado', () => {
  test.afterAll(async () => {
    await db.$disconnect()
  })

  test('dos emisiones concurrentes dejan exactamente un único enlace utilizable', async () => {
    const user = await createRecoveryUser('concurrent-issue')
    try {
      const [first, second] = await Promise.all([
        createStoredPasswordRecovery(user.email),
        createStoredPasswordRecovery(user.email),
      ])
      expect(first).not.toBeNull()
      expect(second).not.toBeNull()

      const rows = await db.appConfig.findMany({
        where: { key: { startsWith: 'password_reset:' }, value: { contains: user.id } },
      })
      const parsed = rows.map((row) => JSON.parse(row.value) as { usedAt: string | null })
      expect(parsed).toHaveLength(2)
      expect(parsed.filter((row) => row.usedAt === null)).toHaveLength(1)

      const consumed = await Promise.all([
        consumeStoredPasswordRecovery(first!.rawToken),
        consumeStoredPasswordRecovery(second!.rawToken),
      ])
      expect(consumed.filter((value) => value === user.id)).toHaveLength(1)
      expect(consumed.filter((value) => value === null)).toHaveLength(1)
    } finally {
      await cleanup(user.id)
    }
  })

  test('doble confirmación concurrente consume el token una sola vez y deja una sola contraseña ganadora', async ({ request }) => {
    const user = await createRecoveryUser('concurrent-confirm')
    try {
      const issued = await createStoredPasswordRecovery(user.email)
      expect(issued).not.toBeNull()

      const [first, second] = await Promise.all([
        request.post('/api/recovery/password/confirm', {
          data: { token: issued!.rawToken, password: resetPasswordA },
        }),
        request.post('/api/recovery/password/confirm', {
          data: { token: issued!.rawToken, password: resetPasswordB },
        }),
      ])

      expect([first.status(), second.status()].sort((a, b) => a - b)).toEqual([200, 400])
      expect(first.headers()['cache-control']).toContain('no-store')
      expect(second.headers()['cache-control']).toContain('no-store')

      expect((await apiLogin(request, user.email, originalPassword)).status()).toBe(401)
      const loginA = await apiLogin(request, user.email, resetPasswordA)
      const loginB = await apiLogin(request, user.email, resetPasswordB)
      expect([loginA.ok(), loginB.ok()].filter(Boolean)).toHaveLength(1)
    } finally {
      await cleanup(user.id)
    }
  })

  test('un token emitido deja de ser válido si la cuenta se desactiva antes de confirmarlo', async ({ request }) => {
    const user = await createRecoveryUser('deactivated')
    try {
      const issued = await createStoredPasswordRecovery(user.email)
      expect(issued).not.toBeNull()
      await db.user.update({ where: { id: user.id }, data: { active: false } })

      const response = await request.post('/api/recovery/password/confirm', {
        data: { token: issued!.rawToken, password: resetPasswordA },
      })
      expect(response.status()).toBe(400)
      expect(response.headers()['cache-control']).toContain('no-store')

      const row = await db.appConfig.findUnique({
        where: { key: `password_reset:${issued!.rawToken ? (await import('../src/lib/password-recovery')).hashRecoveryToken(issued!.rawToken) : ''}` },
      })
      expect(row).not.toBeNull()
      expect(JSON.parse(row!.value).usedAt).toBeNull()
      expect((await apiLogin(request, user.email, originalPassword)).status()).toBe(401)
    } finally {
      await cleanup(user.id)
    }
  })

  test('refresh y back-forward conservan el enlace hasta consumirlo; después el historial no lo reactiva', async ({ page }) => {
    const user = await createRecoveryUser('navigation')
    try {
      const issued = await createStoredPasswordRecovery(user.email)
      expect(issued).not.toBeNull()
      const resetPath = `/restablecer-password?token=${encodeURIComponent(issued!.rawToken)}`

      await page.goto(resetPath)
      await expect(page.getByRole('button', { name: 'Actualizar contraseña' })).toBeEnabled()
      await page.reload()
      await expect(page.getByRole('button', { name: 'Actualizar contraseña' })).toBeEnabled()
      await page.goto('/login')
      await page.goBack()
      await expect(page).toHaveURL(new RegExp('/restablecer-password\\?token='))
      await expect(page.getByRole('button', { name: 'Actualizar contraseña' })).toBeEnabled()
      await page.goForward()
      await expect(page).toHaveURL('/login')
      await page.goBack()

      await page.locator('#password').fill(resetPasswordA)
      await page.locator('#confirmation').fill(resetPasswordA)
      await page.getByRole('button', { name: 'Actualizar contraseña' }).click()
      await expect(page.getByRole('status')).toContainText('Contraseña actualizada')

      await page.reload()
      await page.locator('#password').fill(resetPasswordB)
      await page.locator('#confirmation').fill(resetPasswordB)
      await page.getByRole('button', { name: 'Actualizar contraseña' }).click()
      await expect(page.getByText('El enlace no es válido o ha caducado', { exact: true })).toBeVisible()
      expect((await apiLogin(page.request, user.email, resetPasswordA)).ok()).toBe(true)
      expect((await apiLogin(page.request, user.email, resetPasswordB)).status()).toBe(401)
    } finally {
      await cleanup(user.id)
    }
  })
})
