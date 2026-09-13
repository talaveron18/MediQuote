import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? '';
const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = {
  status: number;
  body: T;
  headers: Record<string, string>;
};

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
    return {
      status: response.status,
      body: parsed,
      headers: Object.fromEntries(response.headers.entries()),
    };
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

async function createBudget(page: Page) {
  const calculation = await api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [{
      blockType: 'material',
      serviceName: 'Firma emisión E2E',
      professionalCategory: 'e2e-category-nursing',
      dateMode: 'range',
      dateRangeStart: '2026-11-02',
      dateRangeEnd: '2026-11-02',
      shiftType: 'morning',
      hoursPerDay: 8,
      unitType: 'unidad',
      quantity: 1,
      pricePerHour: 31,
      fixedPrice: 31,
      ivaPercent: 21,
    }],
    discountPercent: 0,
    ivaPercent: 21,
  });
  expect(calculation.status).toBe(200);
  expect(calculation.body.commercial.status).toBe('calculated');

  const created = await api<CreatedBudget>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001',
    calculationToken: calculation.body.totals.calculationToken,
    description: 'Firma emisión E2E',
    status: 'borrador',
  });
  expect(created.status).toBe(201);
  return created.body.budget.id;
}

async function issue(page: Page, budgetId: string) {
  const response = await api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId,
    recipientEmail: 'cliente@example.invalid',
  });
  expect(response.status).toBe(201);
  return response;
}

async function accept(page: Page, signingUrl: string) {
  const token = new URL(signingUrl).pathname.split('/').pop()!;
  const response = await api<{ status: string }>(page, '/api/public/signature', 'POST', {
    token,
    signerName: 'Cliente E2E',
    signerEmail: 'cliente@example.invalid',
    signatureData: validPng,
    consent: true,
  });
  expect(response.status).toBe(200);
  expect(response.body.status).toBe('accepted');
}

test('emisión y listado de firma son privados y no cacheables', async ({ page }) => {
  await login(page);
  const budgetId = await createBudget(page);
  const created = await issue(page, budgetId);
  expect(created.headers['cache-control']).toContain('private');
  expect(created.headers['cache-control']).toContain('no-store');
  expect(created.headers.pragma).toBe('no-cache');

  const listed = await api<{ requests: Array<{ id: string; status: string }> }>(page, `/api/signatures?budgetId=${budgetId}`);
  expect(listed.status).toBe(200);
  expect(listed.body.requests.some((row) => row.id === created.body.id && row.status === 'pending')).toBe(true);
  expect(listed.headers['cache-control']).toContain('no-store');
  expect(listed.headers.pragma).toBe('no-cache');
});

test('reemisión intencional tras la ventana anti-doble-clic conserva una sola solicitud pendiente y deja presupuesto enviado', async ({ page }) => {
  await login(page);
  const budgetId = await createBudget(page);
  const first = await issue(page, budgetId);
  await page.waitForTimeout(2100);
  const second = await issue(page, budgetId);

  const listed = await api<{ requests: Array<{ id: string; status: string }> }>(page, `/api/signatures?budgetId=${budgetId}`);
  expect(listed.status).toBe(200);
  expect(listed.body.requests.find((row) => row.id === first.body.id)?.status).toBe('revoked');
  expect(listed.body.requests.find((row) => row.id === second.body.id)?.status).toBe('pending');
  expect(listed.body.requests.filter((row) => row.status === 'pending')).toHaveLength(1);

  const budgets = await api<{ budgets: Array<{ id: string; status: string }> }>(page, '/api/budgets');
  expect(budgets.body.budgets.find((row) => row.id === budgetId)?.status).toBe('enviado');
});

test('un presupuesto aceptado no puede volver a degradarse a enviado', async ({ page }) => {
  await login(page);
  const budgetId = await createBudget(page);
  const signing = await issue(page, budgetId);
  await accept(page, signing.body.signingUrl);

  const retry = await api<{ error: string }>(page, '/api/signatures', 'POST', {
    budgetId,
    recipientEmail: 'cliente@example.invalid',
  });
  expect(retry.status).toBe(409);
  expect(retry.body.error).toContain('aceptado');
  expect(retry.headers['cache-control']).toContain('no-store');

  const budgets = await api<{ budgets: Array<{ id: string; status: string }> }>(page, '/api/budgets');
  expect(budgets.body.budgets.find((row) => row.id === budgetId)?.status).toBe('aceptado');
});

test('certificado aceptado bloquea framing, sniffing y referrer', async ({ page }) => {
  await login(page);
  const budgetId = await createBudget(page);
  const signing = await issue(page, budgetId);
  await accept(page, signing.body.signingUrl);

  const certificate = await page.evaluate(async (id) => {
    const list = await fetch(`/api/signatures?budgetId=${id}`, { credentials: 'same-origin' });
    const payload = await list.json() as { requests: Array<{ id: string; status: string }> };
    const accepted = payload.requests.find((row) => row.status === 'accepted');
    if (!accepted) return null;
    const response = await fetch(`/api/signatures?certificate=${accepted.id}`, { credentials: 'same-origin' });
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      cacheControl: response.headers.get('cache-control'),
      frame: response.headers.get('x-frame-options'),
      sniff: response.headers.get('x-content-type-options'),
      referrer: response.headers.get('referrer-policy'),
      body: await response.text(),
    };
  }, budgetId);

  expect(certificate).not.toBeNull();
  expect(certificate!.status).toBe(200);
  expect(certificate!.contentType).toContain('text/html');
  expect(certificate!.cacheControl).toContain('no-store');
  expect(certificate!.frame).toBe('DENY');
  expect(certificate!.sniff).toBe('nosniff');
  expect(certificate!.referrer).toBe('no-referrer');
  expect(certificate!.body).toContain('Certificado de aceptación electrónica');
});
