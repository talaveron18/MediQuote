import { expect, test } from '@playwright/test';

function requiredEnv(name: 'E2E_ADMIN_PASSWORD'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const adminPassword = requiredEnv('E2E_ADMIN_PASSWORD');

type BrowserResponse = {
  status: number;
  text: string;
  headers: Record<string, string>;
};

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.admin@example.invalid');
  await page.locator('input#password').fill(adminPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function browserJsonRequest(
  page: import('@playwright/test').Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  body?: string,
): Promise<BrowserResponse> {
  return page.evaluate(async ({ requestPath, requestMethod, requestBody }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      credentials: 'same-origin',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { status: response.status, text: await response.text(), headers };
  }, { requestPath: path, requestMethod: method, requestBody: body });
}

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.headers.pragma).toBe('no-cache');
  expect(response.headers.expires).toBe('0');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('costing rechaza raíz JSON no-objeto sin ejecutar el motor ni devolver 500', async ({ page }) => {
  for (const raw of ['null', '[]', '"texto"', '7', 'true']) {
    const response = await browserJsonRequest(page, '/api/costing', 'POST', raw);
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(response.text).toContain('objeto JSON');
  }
});

test('verified-labor-costs rechaza raíz no-objeto y record array sin alterar el almacén', async ({ page }) => {
  const beforeResponse = await browserJsonRequest(page, '/api/verified-labor-costs', 'GET');
  expect(beforeResponse.status).toBe(200);
  const before = JSON.parse(beforeResponse.text) as { records: unknown[] };

  for (const raw of ['null', '[]', '{"record":[]}']) {
    const response = await browserJsonRequest(page, '/api/verified-labor-costs', 'POST', raw);
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
  }

  const afterResponse = await browserJsonRequest(page, '/api/verified-labor-costs', 'GET');
  expect(afterResponse.status).toBe(200);
  const after = JSON.parse(afterResponse.text) as { records: unknown[] };
  expect(after.records).toEqual(before.records);
});

test('alta de cliente rechaza JSON malformado o no-objeto sin crear registros', async ({ page }) => {
  const marker = `boundary-${Date.now()}@example.invalid`;

  const malformed = await browserJsonRequest(page, '/api/clients', 'POST', '{mal');
  expect(malformed.status).toBe(400);
  expectPrivateNoStore(malformed);

  for (const raw of ['null', '[]', JSON.stringify({ businessName: ['Empresa'], cif: 'X', fiscalAddress: 'Y', email: marker })]) {
    const response = await browserJsonRequest(page, '/api/clients', 'POST', raw);
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
  }

  const clientsResponse = await browserJsonRequest(page, `/api/clients?search=${encodeURIComponent(marker)}`, 'GET');
  expect(clientsResponse.status).toBe(200);
  expectPrivateNoStore(clientsResponse);
  expect(JSON.parse(clientsResponse.text)).toEqual([]);
});

test('edición de cliente rechaza JSON no-objeto y tipos inválidos sin mutar el cliente', async ({ page }) => {
  const clientsResponse = await browserJsonRequest(page, '/api/clients', 'GET');
  expect(clientsResponse.status).toBe(200);
  const clients = JSON.parse(clientsResponse.text) as Array<{ id: string; notes?: string | null }>;
  expect(clients.length).toBeGreaterThan(0);
  const target = clients[0];

  for (const raw of ['null', '[]', JSON.stringify({ id: target.id, notes: { invalid: true } })]) {
    const response = await browserJsonRequest(page, '/api/clients', 'PUT', raw);
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
  }

  const afterResponse = await browserJsonRequest(page, '/api/clients', 'GET');
  expect(afterResponse.status).toBe(200);
  const after = JSON.parse(afterResponse.text) as Array<{ id: string; notes?: string | null }>;
  expect(after.find((client) => client.id === target.id)?.notes ?? null).toBe(target.notes ?? null);
});

test('edición de cliente rechaza campos fuera de allowlist sin mutar el registro', async ({ page }) => {
  const clientsResponse = await browserJsonRequest(page, '/api/clients', 'GET');
  expect(clientsResponse.status).toBe(200);
  const clients = JSON.parse(clientsResponse.text) as Array<{ id: string; businessName: string }>;
  expect(clients.length).toBeGreaterThan(0);
  const target = clients[0];

  const response = await browserJsonRequest(page, '/api/clients', 'PUT', JSON.stringify({
    id: target.id,
    businessName: 'NO-DEBE-PERSISTIR',
    createdAt: '2000-01-01T00:00:00.000Z',
  }));
  expect(response.status).toBe(400);
  expectPrivateNoStore(response);
  expect(response.text).toContain('Campos no permitidos');

  const afterResponse = await browserJsonRequest(page, '/api/clients', 'GET');
  const after = JSON.parse(afterResponse.text) as Array<{ id: string; businessName: string }>;
  expect(after.find((client) => client.id === target.id)?.businessName).toBe(target.businessName);
});

test('edición de cliente no permite vaciar identidad obligatoria', async ({ page }) => {
  const clientsResponse = await browserJsonRequest(page, '/api/clients', 'GET');
  expect(clientsResponse.status).toBe(200);
  const clients = JSON.parse(clientsResponse.text) as Array<{
    id: string;
    businessName: string;
    cif: string;
    fiscalAddress: string;
  }>;
  expect(clients.length).toBeGreaterThan(0);
  const target = clients[0];

  for (const patch of [
    { businessName: '   ' },
    { cif: null },
    { fiscalAddress: '' },
  ]) {
    const response = await browserJsonRequest(page, '/api/clients', 'PUT', JSON.stringify({ id: target.id, ...patch }));
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
  }

  const afterResponse = await browserJsonRequest(page, '/api/clients', 'GET');
  const after = JSON.parse(afterResponse.text) as Array<{
    id: string;
    businessName: string;
    cif: string;
    fiscalAddress: string;
  }>;
  const persisted = after.find((client) => client.id === target.id);
  expect(persisted?.businessName).toBe(target.businessName);
  expect(persisted?.cif).toBe(target.cif);
  expect(persisted?.fiscalAddress).toBe(target.fiscalAddress);
});
