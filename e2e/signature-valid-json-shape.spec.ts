import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD;

type ApiResult<T = unknown> = { status: number; body: T; cacheControl: string | null; pragma: string | null };
type Calculation = { totals: { calculationToken: string }; commercial: { status: string } };
type CreatedBudget = { budget: { id: string; status: string } };
type SignatureRequest = { id: string; signingUrl: string };

async function api<T = unknown>(page: Page, path: string, method = 'GET', body?: unknown): Promise<ApiResult<T>> {
  return page.evaluate(async ({ requestPath, requestMethod, requestBody }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      credentials: 'same-origin',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    return { status: response.status, body: parsed, cacheControl: response.headers.get('cache-control'), pragma: response.headers.get('pragma') };
  }, { requestPath: path, requestMethod: method, requestBody: body }) as Promise<ApiResult<T>>;
}

async function rawJson<T = unknown>(page: Page, path: string, rawBody: string): Promise<ApiResult<T>> {
  return page.evaluate(async ({ requestPath, requestBody }) => {
    const response = await fetch(requestPath, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: requestBody,
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    return { status: response.status, body: parsed, cacheControl: response.headers.get('cache-control'), pragma: response.headers.get('pragma') };
  }, { requestPath: path, requestBody: rawBody }) as Promise<ApiResult<T>>;
}

async function login(page: Page) {
  if (!maestroPassword) throw new Error('E2E_MAESTRO_PASSWORD is required');
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(maestroPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function createBudget(page: Page, label: string) {
  const calculation = await api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [{ blockType: 'material', serviceName: label, professionalCategory: 'e2e-category-nursing', dateMode: 'range', dateRangeStart: '2026-11-18', dateRangeEnd: '2026-11-18', shiftType: 'morning', hoursPerDay: 8, unitType: 'unidad', quantity: 1, pricePerHour: 31, fixedPrice: 31, ivaPercent: 21 }],
    discountPercent: 0, ivaPercent: 21,
  });
  expect(calculation.status).toBe(200);
  expect(calculation.body.commercial.status).toBe('calculated');
  const created = await api<CreatedBudget>(page, '/api/budgets', 'POST', { clientId: 'e2e-client-001', calculationToken: calculation.body.totals.calculationToken, description: label, status: 'borrador' });
  expect(created.status).toBe(201);
  return created.body.budget.id;
}

async function issue(page: Page, budgetId: string) {
  const response = await api<SignatureRequest>(page, '/api/signatures', 'POST', { budgetId, recipientEmail: 'cliente@example.invalid' });
  expect(response.status).toBe(201);
  return response.body;
}

function tokenFrom(url: string) { return new URL(url).pathname.split('/').filter(Boolean).pop()!; }

function expectPrivateBadRequest(response: ApiResult<{ error?: string }>) {
  expect(response.status).toBe(400);
  expect(response.cacheControl).toContain('private');
  expect(response.cacheControl).toContain('no-store');
  expect(response.pragma).toBe('no-cache');
  expect(response.body.error).toContain('objeto JSON válido');
}

test.beforeEach(async ({ page }) => { await login(page); });

test('emisión privada rechaza JSON null sin 500 ni mutación', async ({ page }) => {
  const budgetId = await createBudget(page, `Firma null privada ${Date.now()}`);
  const before = await api<{ requests: Array<{ id: string }> }>(page, `/api/signatures?budgetId=${budgetId}`);
  expectPrivateBadRequest(await rawJson<{ error?: string }>(page, '/api/signatures', 'null'));
  const after = await api<{ requests: Array<{ id: string }> }>(page, `/api/signatures?budgetId=${budgetId}`);
  expect(after.body.requests).toEqual(before.body.requests);
});

test('emisión privada rechaza arrays y escalares JSON sin crear ni revocar solicitudes', async ({ page }) => {
  const budgetId = await createBudget(page, `Firma shape privada ${Date.now()}`);
  const issued = await issue(page, budgetId);
  for (const raw of ['[]', '"texto"', '42', 'true']) expectPrivateBadRequest(await rawJson<{ error?: string }>(page, '/api/signatures', raw));
  const listed = await api<{ requests: Array<{ id: string; status: string }> }>(page, `/api/signatures?budgetId=${budgetId}`);
  expect(listed.body.requests.filter((row) => row.id === issued.id)).toEqual([expect.objectContaining({ id: issued.id, status: 'pending' })]);
  expect(listed.body.requests).toHaveLength(1);
});

test('aceptación pública rechaza JSON null sin consumir un enlace válido', async ({ page }) => {
  const budgetId = await createBudget(page, `Firma null pública ${Date.now()}`);
  const issued = await issue(page, budgetId);
  const token = tokenFrom(issued.signingUrl);
  expectPrivateBadRequest(await rawJson<{ error?: string }>(page, '/api/public/signature', 'null'));
  const pending = await api<{ status: string }>(page, `/api/public/signature?token=${encodeURIComponent(token)}`);
  expect(pending.status).toBe(200);
  expect(pending.body.status).toBe('pending');
});

test('aceptación pública rechaza arrays y escalares JSON sin invalidar el token', async ({ page }) => {
  const budgetId = await createBudget(page, `Firma shape pública ${Date.now()}`);
  const issued = await issue(page, budgetId);
  const token = tokenFrom(issued.signingUrl);
  for (const raw of ['[]', '"texto"', '42', 'false']) expectPrivateBadRequest(await rawJson<{ error?: string }>(page, '/api/public/signature', raw));
  const pending = await api<{ status: string }>(page, `/api/public/signature?token=${encodeURIComponent(token)}`);
  expect(pending.status).toBe(200);
  expect(pending.body.status).toBe('pending');
});
