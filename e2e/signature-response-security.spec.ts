import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';

type ApiResult<T = unknown> = { status: number; body: T; cacheControl: string | null };
type Calculation = { totals: { calculationToken: string }; commercial: { status: string } };
type CreatedBudget = { budget: { id: string } };
type SignatureRequest = { signingUrl: string };

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
    return { status: response.status, body: parsed, cacheControl: response.headers.get('cache-control') };
  }, { requestPath: path, requestMethod: method, requestBody: body }) as Promise<ApiResult<T>>;
}

async function login(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(maestroPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function createSignature(page: Page) {
  const calculation = await api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [{
      blockType: 'material', serviceName: 'Firma respuesta E2E', professionalCategory: 'e2e-category-nursing',
      dateMode: 'range', dateRangeStart: '2026-10-12', dateRangeEnd: '2026-10-12', shiftType: 'morning',
      hoursPerDay: 8, unitType: 'unidad', quantity: 1, pricePerHour: 19, fixedPrice: 19, ivaPercent: 21,
    }],
    discountPercent: 0,
    ivaPercent: 21,
  });
  expect(calculation.status).toBe(200);
  expect(calculation.body.commercial.status).toBe('calculated');

  const budget = await api<CreatedBudget>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001',
    calculationToken: calculation.body.totals.calculationToken,
    description: 'Firma respuesta E2E',
    status: 'borrador',
  });
  expect(budget.status).toBe(201);

  const signature = await api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId: budget.body.budget.id,
    recipientEmail: 'cliente@example.invalid',
  });
  expect(signature.status).toBe(201);
  const token = new URL(signature.body.signingUrl).pathname.split('/').pop()!;
  return token;
}

test('firma pública pendiente se entrega siempre con no-store', async ({ page }) => {
  await login(page);
  const token = await createSignature(page);
  const response = await api<{ status: string; recipientEmail: string }>(page, `/api/public/signature?token=${encodeURIComponent(token)}`);
  expect(response.status).toBe(200);
  expect(response.body.status).toBe('pending');
  expect(response.body.recipientEmail).toBe('cliente@example.invalid');
  expect(response.cacheControl).toContain('no-store');
});

test('firma con MIME PNG fingido se rechaza sin consumir el enlace', async ({ page }) => {
  await login(page);
  const token = await createSignature(page);
  const forged = await api<{ error: string }>(page, '/api/public/signature', 'POST', {
    token,
    signerName: 'Cliente E2E',
    signerEmail: 'cliente@example.invalid',
    signatureData: 'data:image/png;base64,QUFBQQ==',
    consent: true,
  });
  expect(forged.status).toBe(400);
  expect(forged.cacheControl).toContain('no-store');

  const pending = await api<{ status: string }>(page, `/api/public/signature?token=${encodeURIComponent(token)}`);
  expect(pending.status).toBe(200);
  expect(pending.body.status).toBe('pending');
});
