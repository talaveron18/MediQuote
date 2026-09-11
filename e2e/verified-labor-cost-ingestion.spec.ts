import { expect, test, type Page } from '@playwright/test'

function requiredEnv(name: 'E2E_ADMIN_PASSWORD' | 'E2E_COMMERCIAL_PASSWORD'): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`)
  return value
}

const credentials = {
  admin: { email: 'e2e.admin@example.invalid', password: requiredEnv('E2E_ADMIN_PASSWORD') },
  comercial: { email: 'e2e.comercial@example.invalid', password: requiredEnv('E2E_COMMERCIAL_PASSWORD') },
}

type Role = keyof typeof credentials
type ApiResponse<T = unknown> = { status: number; headers: Record<string, string>; body: T }
type LaborRecord = {
  id: string
  conceptKey: string
  categoryId: string
  territory: string
  contractType: string
  value: number
  status: string
  sourceDocument: string
}

async function login(page: Page, role: Role) {
  await page.context().clearCookies()
  await page.goto('/login')
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true')
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(credentials[role].email)
  await page.locator('input#password').fill(credentials[role].password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL('/')
}

async function api<T = unknown>(page: Page, method: 'GET' | 'POST', body?: unknown): Promise<ApiResponse<T>> {
  return page.evaluate(async ({ requestMethod, requestBody }) => {
    const response = await fetch('/api/verified-labor-costs', {
      method: requestMethod,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    })
    const text = await response.text()
    let parsed: unknown = null
    if (text) {
      try { parsed = JSON.parse(text) } catch { parsed = text }
    }
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: parsed }
  }, { requestMethod: method, requestBody: body }) as Promise<ApiResponse<T>>
}

function expectPrivateNoStore(response: ApiResponse) {
  expect(response.headers['cache-control']).toContain('private')
  expect(response.headers['cache-control']).toContain('no-store')
  expect(response.headers.pragma).toBe('no-cache')
  expect(response.headers.expires).toBe('0')
  expect(response.headers['x-content-type-options']).toBe('nosniff')
}

function fixture(marker: string, value = 23.45) {
  return {
    id: `e2e-labor-${marker}`,
    conceptKey: 'productive_hour_gross',
    categoryId: `e2e-category-ingestion-only-${marker}`,
    territory: 'Madrid',
    contractType: 'indefinido',
    value,
    unit: 'EUR/h_productiva',
    effectiveFrom: '2026-09-01',
    sourceDocument: `GESTORIA-E2E-${marker}`,
    sourceDate: '2026-09-01',
    status: 'verified',
  }
}

test('costes laborales verificados: acceso administrativo, validación, idempotencia y conflicto sin mutación', async ({ page }) => {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const record = fixture(marker)

  await login(page, 'comercial')
  const commercialGet = await api(page, 'GET')
  const commercialPost = await api(page, 'POST', { record })
  expect(commercialGet.status).toBe(403)
  expect(commercialPost.status).toBe(403)

  await login(page, 'admin')
  const invalid = await api<{ status: string; issues: Array<{ field: string }> }>(page, 'POST', {
    record: { ...record, id: `${record.id}-invalid`, conceptKey: 'invented_rule', value: -1, sourceDocument: '' },
  })
  expect(invalid.status).toBe(422)
  expect(invalid.body.status).toBe('invalid')
  expect(invalid.body.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining([
    'conceptKey', 'value', 'sourceDocument',
  ]))
  expectPrivateNoStore(invalid)

  const concurrent = await page.evaluate(async (payload) => {
    const send = async () => {
      const response = await fetch('/api/verified-labor-costs', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: payload }),
      })
      return { status: response.status, body: await response.json() }
    }
    return Promise.all([send(), send()])
  }, record)

  expect(concurrent.map((response) => response.status).sort()).toEqual([200, 201])
  expect(concurrent.filter((response) => response.body.duplicate === false)).toHaveLength(1)
  expect(concurrent.filter((response) => response.body.duplicate === true)).toHaveLength(1)

  const correction = await api<{ status: string; issues: Array<{ kind: string; message: string }> }>(page, 'POST', {
    record: { ...record, value: record.value + 7.25 },
  })
  expect(correction.status).toBe(409)
  expect(correction.body.status).toBe('conflict')
  expect(correction.body.issues.some((issue) => issue.kind === 'blocked')).toBe(true)
  expectPrivateNoStore(correction)

  const listed = await api<{ records: LaborRecord[] }>(page, 'GET')
  expect(listed.status).toBe(200)
  expectPrivateNoStore(listed)
  const matches = listed.body.records.filter((candidate) => candidate.id === record.id)
  expect(matches).toHaveLength(1)
  expect(matches[0]).toMatchObject({
    id: record.id,
    conceptKey: record.conceptKey,
    categoryId: record.categoryId,
    territory: record.territory,
    contractType: record.contractType,
    value: record.value,
    status: 'verified',
    sourceDocument: record.sourceDocument,
  })
  expect(listed.body.records.some((candidate) => candidate.id === `${record.id}-invalid`)).toBe(false)
})

test('costes laborales verificados: dos escrituras concurrentes divergentes no pueden pisarse', async ({ page }) => {
  await login(page, 'admin')
  const marker = `race-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const original = fixture(marker, 31.1)
  const divergent = { ...original, value: 46.8 }

  const responses = await page.evaluate(async ({ first, second }) => {
    const send = async (record: typeof first) => {
      const response = await fetch('/api/verified-labor-costs', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ record }),
      })
      return { status: response.status, body: await response.json() }
    }
    return Promise.all([send(first), send(second)])
  }, { first: original, second: divergent })

  expect(responses.map((response) => response.status).sort()).toEqual([201, 409])
  const winner = responses.find((response) => response.status === 201)
  const rejected = responses.find((response) => response.status === 409)
  expect(winner?.body.duplicate).toBe(false)
  expect(rejected?.body.status).toBe('conflict')

  const listed = await api<{ records: LaborRecord[] }>(page, 'GET')
  const matches = listed.body.records.filter((candidate) => candidate.id === original.id)
  expect(matches).toHaveLength(1)
  expect([original.value, divergent.value]).toContain(matches[0].value)
})
