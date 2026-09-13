import { expect, test } from '@playwright/test'

function requiredEnv(name: 'E2E_ADMIN_PASSWORD'): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`)
  return value
}

const adminPassword = requiredEnv('E2E_ADMIN_PASSWORD')

type BrowserResponse = {
  status: number
  text: string
  headers: Record<string, string>
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true')
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.admin@example.invalid')
  await page.locator('input#password').fill(adminPassword)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL('/')
}

async function browserRequest(
  page: import('@playwright/test').Page,
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  body?: string,
): Promise<BrowserResponse> {
  return page.evaluate(async ({ requestPath, requestMethod, requestBody }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      credentials: 'same-origin',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody,
    })
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => { headers[key] = value })
    return { status: response.status, text: await response.text(), headers }
  }, { requestPath: path, requestMethod: method, requestBody: body })
}

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toBe('private, no-store')
  expect(response.headers.pragma).toBe('no-cache')
  expect(response.headers.expires).toBe('0')
  expect(response.headers['x-content-type-options']).toBe('nosniff')
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('GET clientes rechaza parámetros laterales y search duplicado', async ({ page }) => {
  for (const path of ['/api/clients?unexpected=1', '/api/clients?search=a&search=b']) {
    const response = await browserRequest(page, path, 'GET')
    expect(response.status).toBe(400)
    expectPrivateNoStore(response)
  }
})

test('POST clientes rechaza mass-assignment sin crear registro', async ({ page }) => {
  const marker = `client-contract-${Date.now()}`
  const response = await browserRequest(page, '/api/clients', 'POST', JSON.stringify({
    businessName: marker,
    cif: `CIF-${marker}`,
    fiscalAddress: 'Dirección de prueba',
    createdAt: '2000-01-01T00:00:00.000Z',
  }))
  expect(response.status).toBe(400)
  expectPrivateNoStore(response)
  expect(response.text).toContain('Campos no permitidos')

  const lookup = await browserRequest(page, `/api/clients?search=${encodeURIComponent(marker)}`, 'GET')
  expect(lookup.status).toBe(200)
  expect(JSON.parse(lookup.text)).toEqual([])
})

test('DELETE clientes exige id único y rechaza parámetros laterales antes de borrar', async ({ page }) => {
  const marker = `client-delete-${Date.now()}`
  const createdResponse = await browserRequest(page, '/api/clients', 'POST', JSON.stringify({
    businessName: marker,
    cif: `CIF-${marker}`,
    fiscalAddress: 'Dirección de prueba',
  }))
  expect(createdResponse.status).toBe(201)
  const created = JSON.parse(createdResponse.text) as { id: string }

  for (const path of [
    `/api/clients?id=${encodeURIComponent(created.id)}&unexpected=1`,
    `/api/clients?id=${encodeURIComponent(created.id)}&id=${encodeURIComponent(created.id)}`,
    '/api/clients?id=%20%20%20',
  ]) {
    const response = await browserRequest(page, path, 'DELETE')
    expect(response.status).toBe(400)
    expectPrivateNoStore(response)
  }

  const stillThere = await browserRequest(page, `/api/clients?search=${encodeURIComponent(marker)}`, 'GET')
  expect(stillThere.status).toBe(200)
  expect((JSON.parse(stillThere.text) as Array<{ id: string }>).some((client) => client.id === created.id)).toBe(true)

  const deleted = await browserRequest(page, `/api/clients?id=${encodeURIComponent(created.id)}`, 'DELETE')
  expect(deleted.status).toBe(200)
  expectPrivateNoStore(deleted)
  expect(JSON.parse(deleted.text)).toEqual({ success: true })
})
