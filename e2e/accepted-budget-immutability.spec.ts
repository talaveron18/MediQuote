import { expect, test, type Page } from '@playwright/test';

const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = { totals: { calculationToken: string; totalFinal: number } };
type SavedBudget = { id: string; code: string; description: string | null; totalFinal: number; status: string };
type SavedPayload = { budget: SavedBudget; immutableArtifact: { version: number; artifactHash: string } };
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
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
    return { status: response.status, body: parsed };
  }, { requestPath: path, requestMethod: method, requestBody: body }) as Promise<ApiResult<T>>;
}

async function login(page: Page) {
  const password = process.env.E2E_MAESTRO_PASSWORD;
  if (!password) throw new Error('E2E_MAESTRO_PASSWORD is required');
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

function block(label: string, fixedPrice: number, date: string) {
  return {
    blockType: 'material', serviceName: label, professionalCategory: 'e2e-category-nursing',
    dateMode: 'range', dateRangeStart: date, dateRangeEnd: date,
    shiftType: 'morning', hoursPerDay: 8, unitType: 'unidad', quantity: 1,
    pricePerHour: fixedPrice, fixedPrice, ivaPercent: 21,
  };
}

async function calculate(page: Page, label: string, fixedPrice: number, date: string) {
  const result = await api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [block(label, fixedPrice, date)], discountPercent: 0, ivaPercent: 21,
  });
  expect(result.status).toBe(200);
  return result.body;
}

async function createBudget(page: Page, marker: string) {
  const calculation = await calculate(page, `${marker} original`, 31, '2026-12-01');
  const saved = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: calculation.totals.calculationToken,
    description: `${marker} original`, status: 'borrador',
  });
  expect(saved.status).toBe(201);
  return saved.body;
}

async function issue(page: Page, budgetId: string) {
  const response = await api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId, recipientEmail: 'accepted.lock@example.invalid',
  });
  expect(response.status).toBe(201);
  return response.body;
}

function tokenFrom(url: string) {
  return new URL(url).pathname.split('/').pop()!;
}

function acceptanceBody(signingUrl: string) {
  return {
    token: tokenFrom(signingUrl), signerName: 'Cliente Bloqueado E2E', signerEmail: 'accepted.lock@example.invalid',
    signatureData: validPng, consent: true,
  };
}

async function accept(page: Page, signingUrl: string) {
  return api<{ status: string }>(page, '/api/public/signature', 'POST', acceptanceBody(signingUrl));
}

async function getBudget(page: Page, id: string) {
  const response = await api<{ budgets: SavedBudget[] }>(page, `/api/budgets?id=${encodeURIComponent(id)}`);
  expect(response.status).toBe(200);
  return response.body.budgets[0];
}

test('1 · un presupuesto aceptado rechaza cambios documentales y conserva su certificado', async ({ page }) => {
  await login(page);
  const original = await createBudget(page, `E2E accepted doc ${Date.now()}`);
  const signing = await issue(page, original.budget.id);
  expect((await accept(page, signing.signingUrl)).status).toBe(200);

  const attempted = await api<{ error: string }>(page, '/api/budgets', 'PUT', {
    id: original.budget.id,
    description: 'MUTACIÓN QUE NO DEBE PERSISTIR',
    clientNotes: 'nota posterior a firma',
  });
  expect(attempted.status).toBe(409);
  expect(attempted.body.error).toMatch(/aceptado.*inmutable/i);

  const persisted = await getBudget(page, original.budget.id);
  expect(persisted.status).toBe('aceptado');
  expect(persisted.description).toBe(original.budget.description);

  const certificate = await page.evaluate(async (id) => {
    const response = await fetch(`/api/signatures?certificate=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    return { status: response.status, html: await response.text() };
  }, signing.id);
  expect(certificate.status).toBe(200);
  expect(certificate.html).toContain(original.budget.code);
  expect(certificate.html).not.toContain('MUTACIÓN QUE NO DEBE PERSISTIR');
});

test('2 · un presupuesto aceptado rechaza edición económica sin consumir la cotización nueva', async ({ page }) => {
  await login(page);
  const original = await createBudget(page, `E2E accepted economic ${Date.now()}`);
  const signing = await issue(page, original.budget.id);
  expect((await accept(page, signing.signingUrl)).status).toBe(200);

  const replacement = await calculate(page, 'E2E cálculo posterior no consumido', 97, '2026-12-02');
  const attempted = await api<{ error: string }>(page, '/api/budgets', 'PUT', {
    id: original.budget.id, serviceBlocks: [], calculationToken: replacement.totals.calculationToken,
    description: 'económico posterior a firma',
  });
  expect(attempted.status).toBe(409);

  const persisted = await getBudget(page, original.budget.id);
  expect(persisted.status).toBe('aceptado');
  expect(persisted.totalFinal).toBe(original.budget.totalFinal);

  const reuse = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: replacement.totals.calculationToken,
    description: `E2E quote retained ${Date.now()}`, status: 'borrador',
  });
  expect(reuse.status).toBe(201);
  expect(reuse.body.budget.totalFinal).toBe(replacement.totals.totalFinal);
});

test('3 · un presupuesto aceptado no puede caducarse mediante DELETE', async ({ page }) => {
  await login(page);
  const original = await createBudget(page, `E2E accepted delete ${Date.now()}`);
  const signing = await issue(page, original.budget.id);
  expect((await accept(page, signing.signingUrl)).status).toBe(200);

  const attempted = await api<{ error: string }>(page, `/api/budgets?id=${encodeURIComponent(original.budget.id)}`, 'DELETE');
  expect(attempted.status).toBe(409);
  expect(attempted.body.error).toMatch(/aceptado.*inmutable/i);

  const persisted = await getBudget(page, original.budget.id);
  expect(persisted.status).toBe('aceptado');
});

test('4 · aceptación y edición económica concurrentes nunca producen una firma sobre contenido distinto', async ({ page }) => {
  await login(page);
  const original = await createBudget(page, `E2E concurrent accept edit ${Date.now()}`);
  const signing = await issue(page, original.budget.id);
  const replacement = await calculate(page, 'E2E concurrent replacement', 113, '2026-12-03');

  const [acceptance, mutation] = await Promise.all([
    api<{ status?: string; error?: string }>(page, '/api/public/signature', 'POST', acceptanceBody(signing.signingUrl)),
    api<SavedPayload | { error: string }>(page, '/api/budgets', 'PUT', {
      id: original.budget.id, serviceBlocks: [], calculationToken: replacement.totals.calculationToken,
      description: 'E2E concurrent replacement persisted only if signature loses race',
    }),
  ]);

  expect([acceptance.status, mutation.status].sort((a, b) => a - b)).toEqual([200, 409]);
  const persisted = await getBudget(page, original.budget.id);
  const signatureState = await api<{ status: string; error?: string }>(
    page,
    `/api/public/signature?token=${encodeURIComponent(tokenFrom(signing.signingUrl))}`,
  );

  if (acceptance.status === 200) {
    expect(mutation.status).toBe(409);
    expect(persisted.status).toBe('aceptado');
    expect(persisted.description).toBe(original.budget.description);
    expect(signatureState.status).toBe(200);
    expect(signatureState.body.status).toBe('accepted');
  } else {
    expect(mutation.status).toBe(200);
    expect(persisted.status).not.toBe('aceptado');
    expect(persisted.description).toBe('E2E concurrent replacement persisted only if signature loses race');
    expect(signatureState.status).toBe(409);
    expect(signatureState.body.status).toBe('revoked');
  }
});
