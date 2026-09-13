import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';
const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = { status: number; body: T; headers: Record<string, string> };
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
    let parsed: unknown = text;
    if (text) {
      try { parsed = JSON.parse(text); } catch { /* texto no JSON */ }
    }
    return { status: response.status, body: parsed, headers: Object.fromEntries(response.headers.entries()) };
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

async function createBudget(page: Page, label: string) {
  const calculation = await api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [{
      blockType: 'material', serviceName: label, professionalCategory: 'e2e-category-nursing',
      dateMode: 'range', dateRangeStart: '2026-11-03', dateRangeEnd: '2026-11-03',
      shiftType: 'morning', hoursPerDay: 8, unitType: 'unidad', quantity: 1,
      pricePerHour: 37, fixedPrice: 37, ivaPercent: 21,
    }],
    discountPercent: 0,
    ivaPercent: 21,
  });
  expect(calculation.status).toBe(200);
  expect(calculation.body.commercial.status).toBe('calculated');
  const created = await api<CreatedBudget>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: calculation.body.totals.calculationToken,
    description: label, status: 'borrador',
  });
  expect(created.status).toBe(201);
  return created.body.budget.id;
}

async function issue(page: Page, budgetId: string, recipientEmail = 'cliente@example.invalid') {
  return api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId, recipientEmail,
  });
}

function tokenFrom(url: string) {
  return new URL(url).pathname.split('/').filter(Boolean).pop()!;
}

test.beforeEach(async ({ page }) => { await login(page); });

test('doble envío secuencial de la misma versión y destinatario no crea ni revoca otra solicitud', async ({ page }) => {
  const budgetId = await createBudget(page, `Firma duplicada secuencial ${Date.now()}`);
  const first = await issue(page, budgetId);
  expect(first.status).toBe(201);

  const duplicate = await api<{ error: string; requestId: string }>(page, '/api/signatures', 'POST', {
    budgetId, recipientEmail: 'cliente@example.invalid',
  });
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.requestId).toBe(first.body.id);
  expect(duplicate.body.error).toContain('Ya existe una solicitud de firma pendiente');
  expect(duplicate.headers['cache-control']).toContain('private');
  expect(duplicate.headers['cache-control']).toContain('no-store');
  expect(JSON.stringify(duplicate.body)).not.toContain('/firmar/');

  const listed = await api<{ requests: Array<{ id: string; status: string }> }>(page, `/api/signatures?budgetId=${budgetId}`);
  expect(listed.status).toBe(200);
  expect(listed.body.requests).toHaveLength(1);
  expect(listed.body.requests[0]).toMatchObject({ id: first.body.id, status: 'pending' });
});

test('dos emisiones simultáneas de la misma versión dejan una sola solicitud y una respuesta conflictiva', async ({ page }) => {
  const budgetId = await createBudget(page, `Firma concurrente ${Date.now()}`);
  const results = await page.evaluate(async (id) => {
    const payload = JSON.stringify({ budgetId: id, recipientEmail: 'cliente@example.invalid' });
    return Promise.all([1, 2].map(async () => {
      const response = await fetch('/api/signatures', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: payload,
      });
      return { status: response.status, body: await response.json() as { id?: string; requestId?: string } };
    }));
  }, budgetId);
  expect(results.map((result) => result.status).sort((a, b) => a - b)).toEqual([201, 409]);

  const created = results.find((result) => result.status === 201)!;
  const duplicate = results.find((result) => result.status === 409)!;
  expect(duplicate.body.requestId).toBe(created.body.id);

  const listed = await api<{ requests: Array<{ id: string; status: string }> }>(page, `/api/signatures?budgetId=${budgetId}`);
  expect(listed.status).toBe(200);
  expect(listed.body.requests.filter((row) => row.status === 'pending')).toHaveLength(1);
  expect(listed.body.requests.filter((row) => row.status === 'revoked')).toHaveLength(0);
  expect(listed.body.requests).toHaveLength(1);
});

test('cambiar el destinatario sigue siendo una reemisión explícita y revoca la solicitud anterior', async ({ page }) => {
  const budgetId = await createBudget(page, `Firma destinatario nuevo ${Date.now()}`);
  const first = await issue(page, budgetId, 'cliente@example.invalid');
  expect(first.status).toBe(201);

  const second = await issue(page, budgetId, 'otro-cliente@example.invalid');
  expect(second.status).toBe(201);
  expect(second.body.id).not.toBe(first.body.id);

  const listed = await api<{ requests: Array<{ id: string; status: string; recipientEmail: string }> }>(page, `/api/signatures?budgetId=${budgetId}`);
  expect(listed.status).toBe(200);
  expect(listed.body.requests.find((row) => row.id === first.body.id)?.status).toBe('revoked');
  expect(listed.body.requests.find((row) => row.id === second.body.id)).toMatchObject({
    status: 'pending', recipientEmail: 'otro-cliente@example.invalid',
  });
});

test('aceptación y reemisión concurrentes nunca degradan un presupuesto aceptado ni dejan dos estados activos', async ({ page }) => {
  const budgetId = await createBudget(page, `Firma vs reemisión ${Date.now()}`);
  const first = await issue(page, budgetId);
  expect(first.status).toBe(201);
  const token = tokenFrom(first.body.signingUrl);

  const race = await page.evaluate(async ({ id, signatureToken, png }) => {
    const acceptBody = JSON.stringify({
      token: signatureToken, signerName: 'Cliente E2E', signerEmail: 'cliente@example.invalid',
      signatureData: png, consent: true,
    });
    const issueBody = JSON.stringify({ budgetId: id, recipientEmail: 'cliente@example.invalid' });
    const [accept, reissue] = await Promise.all([
      fetch('/api/public/signature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: acceptBody }),
      fetch('/api/signatures', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: issueBody }),
    ]);
    return { accept: accept.status, reissue: reissue.status };
  }, { id: budgetId, signatureToken: token, png: validPng });

  expect(race.accept).toBe(200);
  expect(race.reissue).toBe(409);

  const listed = await api<{ requests: Array<{ id: string; status: string }> }>(page, `/api/signatures?budgetId=${budgetId}`);
  const budgets = await api<{ budgets: Array<{ id: string; status: string }> }>(page, '/api/budgets');
  const status = budgets.body.budgets.find((row) => row.id === budgetId)?.status;
  expect(status).toBe('aceptado');
  expect(listed.body.requests.filter((row) => row.status === 'pending')).toHaveLength(0);
  expect(listed.body.requests.filter((row) => row.status === 'accepted')).toHaveLength(1);
});

test('emisión privada rechaza JSON malformado sin mutar solicitudes y con no-store', async ({ page }) => {
  const budgetId = await createBudget(page, `Firma JSON privado ${Date.now()}`);
  const before = await api<{ requests: Array<{ id: string }> }>(page, `/api/signatures?budgetId=${budgetId}`);

  const malformed = await page.evaluate(async () => {
    const response = await fetch('/api/signatures', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    return { status: response.status, cache: response.headers.get('cache-control'), pragma: response.headers.get('pragma'), body: await response.json() };
  });
  expect(malformed.status).toBe(400);
  expect(malformed.cache).toContain('private');
  expect(malformed.cache).toContain('no-store');
  expect(malformed.pragma).toBe('no-cache');
  expect((malformed.body as { error: string }).error).toContain('JSON válido');

  const after = await api<{ requests: Array<{ id: string }> }>(page, `/api/signatures?budgetId=${budgetId}`);
  expect(after.body.requests).toHaveLength(before.body.requests.length);
});

test('aceptación pública rechaza JSON malformado sin 500 ni respuesta cacheable', async ({ page }) => {
  const malformed = await page.evaluate(async () => {
    const response = await fetch('/api/public/signature', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    return { status: response.status, cache: response.headers.get('cache-control'), pragma: response.headers.get('pragma'), body: await response.json() };
  });
  expect(malformed.status).toBe(400);
  expect(malformed.cache).toContain('private');
  expect(malformed.cache).toContain('no-store');
  expect(malformed.pragma).toBe('no-cache');
  expect((malformed.body as { error: string }).error).toContain('JSON válido');
});
