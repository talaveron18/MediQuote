import { expect, test, type Page } from '@playwright/test'

function requiredEnv(name: 'E2E_ADMIN_PASSWORD'): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`)
  return value
}

const adminPassword = requiredEnv('E2E_ADMIN_PASSWORD')

type ApiResponse<T = unknown> = { status: number; headers: Record<string, string>; body: T }

async function login(page: Page) {
  await page.goto('/login')
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true')
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.admin@example.invalid')
  await page.locator('input#password').fill(adminPassword)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL('/')
}

async function rawPost(page: Page, rawBody: string): Promise<ApiResponse> {
  return page.evaluate(async (body) => {
    const response = await fetch('/api/verified-labor-costs', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const text = await response.text()
    let parsed: unknown = text
    try { parsed = text ? JSON.parse(text) : null } catch {}
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: parsed }
  }, rawBody)
}

async function listRecords(page: Page): Promise<Array<{ id: string }>> {
  return page.evaluate(async () => {
    const response = await fetch('/api/verified-labor-costs', { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) throw new Error(`GET verified labor costs: ${response.status}`)
    const body = await response.json() as { records: Array<{ id: string }> }
    return body.records
  })
}

function fixture(marker: string) {
  return {
    id: `e2e-hardening-${marker}`,
    conceptKey: 'productive_hour_gross',
    categoryId: `e2e-category-${marker}`,
    territory: 'Madrid',
    contractType: 'indefinido',
    value: 23.45,
    unit: 'EUR/h_productiva',
    effectiveFrom: '2026-09-01',
    sourceDocument: `GESTORIA-E2E-HARDENING-${marker}`,
    sourceDate: '2026-09-01',
    status: 'verified',
  }
}

function expectPrivate(response: ApiResponse) {
  expect(response.headers['cache-control']).toContain('private')
  expect(response.headers['cache-control']).toContain('no-store')
  expect(response.headers.pragma).toBe('no-cache')
  expect(response.headers.expires).toBe('0')
  expect(response.headers['x-content-type-options']).toBe('nosniff')
}

async function expectNoRecord(page: Page, id: string) {
  const records = await listRecords(page)
  expect(records.some((record) => record.id === id)).toBe(false)
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('ingesta verified rechaza raíces y record no objeto sin error interno ni escritura', async ({ page }) => {
  for (const rawBody of ['null', '[]', '"texto"', '12', 'true', '{"record":null}', '{"record":[]}', '{"record":"x"}']) {
    const response = await rawPost(page, rawBody)
    expect(response.status).toBe(400)
    expectPrivate(response)
  }
})

test('ingesta verified no convierte null, vacío o texto numérico en coste cero', async ({ page }) => {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const base = fixture(marker)
  for (const [suffix, value] of [['null', null], ['empty', ''], ['text', '23.45']] as const) {
    const record = { ...base, id: `${base.id}-${suffix}`, value }
    const response = await rawPost(page, JSON.stringify({ record }))
    expect(response.status).toBe(422)
    expectPrivate(response)
    expect(JSON.stringify(response.body)).toContain('value')
    await expectNoRecord(page, record.id)
  }
})

test('ingesta verified rechaza campos textuales con tipo incorrecto y no deja mutación parcial', async ({ page }) => {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const base = fixture(marker)
  const cases = [
    { id: `${base.id}-category`, categoryId: 7 },
    { id: `${base.id}-territory`, territory: false },
    { id: `${base.id}-unit`, unit: ['EUR/h_productiva'] },
    { id: `${base.id}-supersedes`, supersedesId: 99 },
  ]
  for (const override of cases) {
    const record = { ...base, ...override }
    const response = await rawPost(page, JSON.stringify({ record }))
    expect(response.status).toBe(422)
    expectPrivate(response)
    await expectNoRecord(page, record.id)
  }
})

test('ingesta verified rechaza fechas ISO imposibles antes de persistirlas', async ({ page }) => {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const base = fixture(marker)
  const cases = [
    { id: `${base.id}-effective`, effectiveFrom: '2026-02-31' },
    { id: `${base.id}-source`, sourceDate: '2026-13-01' },
    { id: `${base.id}-to`, effectiveTo: '2026-04-31' },
  ]
  for (const override of cases) {
    const record = { ...base, ...override }
    const response = await rawPost(page, JSON.stringify({ record }))
    expect(response.status).toBe(422)
    expectPrivate(response)
    await expectNoRecord(page, record.id)
  }
})
