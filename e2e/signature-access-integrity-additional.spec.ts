import { expect, test, type Page } from '@playwright/test';

function requiredEnv(name: 'E2E_ADMIN_PASSWORD' | 'E2E_MAESTRO_PASSWORD' | 'E2E_COMMERCIAL_PASSWORD'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const credentials = {
  admin: { email: 'e2e.admin@example.invalid', password: requiredEnv('E2E_ADMIN_PASSWORD') },
  maestro: { email: 'e2e.maestro@example.invalid', password: requiredEnv('E2E_MAESTRO_PASSWORD') },
  comercial: { email: 'e2e.comercial@example.invalid', password: requiredEnv('E2E_COMMERCIAL_PASSWORD') },
};

type Role = keyof typeof credentials;
type BrowserResponse<T = unknown> = { status: number; headers: Record<string, string>; body: T; text: string };
type Calculation = { totals: { calculationToken: string } };
type SavedBudget = { budget: { id: string; status: string; createdById: string } };
type SignatureCreated = { id: string; signingUrl: string };

async function request<T = unknown>(
  page: Page,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {},
): Promise<BrowserResponse<T>> {
  return page.evaluate(async ({ requestPath, method, requestBody }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body, text };
  }, { requestPath: path, method: options.method ?? 'GET', requestBody: options.body }) as Promise<BrowserResponse<T>>;
}

async function login(page: Page, role: Role) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(credentials[role].email);
  await page.locator('input#password').fill(credentials[role].password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function clearSession(page: Page) {
  await page.context().clearCookies();
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
}

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toContain('private');
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.headers.pragma).toBe('no-cache');
}

function materialBlock(label: string, price = 23) {
  return {
    blockType: 'material', serviceName: label, professionalCategory: 'e2e-category-nursing',
    dateMode: 'range', dateRangeStart: '2026-10-28', dateRangeEnd: '2026-10-28',
    shiftType: 'morning', hoursPerDay: 8, unitType: 'unidad', quantity: 1,
    pricePerHour: price, fixedPrice: price, ivaPercent: 21,
  };
}

async function createBudget(page: Page, marker: string): Promise<SavedBudget['budget']> {
  const calculation = await request<Calculation>(page, '/api/calculations', {
    method: 'POST', body: { blocks: [materialBlock(marker)], discountPercent: 0, ivaPercent: 21 },
  });
  expect(calculation.status).toBe(200);
  const saved = await request<SavedBudget>(page, '/api/budgets', {
    method: 'POST',
    body: { clientId: 'e2e-client-001', calculationToken: calculation.body.totals.calculationToken, description: marker, status: 'borrador' },
  });
  expect(saved.status).toBe(201);
  return saved.body.budget;
}

test('1 · un comercial no puede listar ni emitir firma sobre presupuesto ajeno', async ({ page }) => {
  await login(page, 'admin');
  const budget = await createBudget(page, `E2E signature foreign ${Date.now()}`);
  await clearSession(page);
  await login(page, 'comercial');

  const listing = await request(page, `/api/signatures?budgetId=${encodeURIComponent(budget.id)}`);
  const issuance = await request(page, '/api/signatures', {
    method: 'POST', body: { budgetId: budget.id, recipientEmail: 'cliente@example.invalid' },
  });

  expect(listing.status).toBe(404);
  expect(issuance.status).toBe(404);
  expectPrivateNoStore(listing);
  expectPrivateNoStore(issuance);
});

test('2 · correo de firma inválido no crea solicitud ni cambia borrador a enviado', async ({ page }) => {
  await login(page, 'maestro');
  const budget = await createBudget(page, `E2E signature invalid email ${Date.now()}`);

  const rejected = await request<{ error: string }>(page, '/api/signatures', {
    method: 'POST', body: { budgetId: budget.id, recipientEmail: 'no-es-correo' },
  });
  expect(rejected.status).toBe(400);
  expectPrivateNoStore(rejected);

  const listing = await request<{ requests: unknown[] }>(page, `/api/signatures?budgetId=${encodeURIComponent(budget.id)}`);
  expect(listing.status).toBe(200);
  expect(listing.body.requests).toHaveLength(0);

  const reopened = await request<{ budgets: Array<{ status: string }> }>(page, `/api/budgets?id=${encodeURIComponent(budget.id)}`);
  expect(reopened.status).toBe(200);
  expect(reopened.body.budgets[0].status).toBe('borrador');
});

test('3 · certificado pendiente no se expone antes de una aceptación válida', async ({ page }) => {
  await login(page, 'maestro');
  const budget = await createBudget(page, `E2E signature pending cert ${Date.now()}`);
  const created = await request<SignatureCreated>(page, '/api/signatures', {
    method: 'POST', body: { budgetId: budget.id, recipientEmail: 'cliente@example.invalid' },
  });
  expect(created.status).toBe(201);

  const certificate = await request(page, `/api/signatures?certificate=${encodeURIComponent(created.body.id)}`);
  expect(certificate.status).toBe(404);
  expectPrivateNoStore(certificate);
  expect(certificate.text).not.toContain('Huella SHA-256');
  expect(certificate.text).not.toContain('documentHash');
});

test('4 · reemisión secuencial deja exactamente un enlace pendiente y revoca el anterior', async ({ page }) => {
  await login(page, 'maestro');
  const budget = await createBudget(page, `E2E signature sequential reissue ${Date.now()}`);

  const first = await request<SignatureCreated>(page, '/api/signatures', {
    method: 'POST', body: { budgetId: budget.id, recipientEmail: 'primero@example.invalid' },
  });
  expect(first.status).toBe(201);
  const firstToken = new URL(first.body.signingUrl).pathname.split('/').pop()!;

  const second = await request<SignatureCreated>(page, '/api/signatures', {
    method: 'POST', body: { budgetId: budget.id, recipientEmail: 'segundo@example.invalid' },
  });
  expect(second.status).toBe(201);

  const listing = await request<{ requests: Array<{ id: string; status: string; recipientEmail: string }> }>(
    page, `/api/signatures?budgetId=${encodeURIComponent(budget.id)}`,
  );
  expect(listing.status).toBe(200);
  const firstRow = listing.body.requests.find((row) => row.id === first.body.id);
  const secondRow = listing.body.requests.find((row) => row.id === second.body.id);
  expect(firstRow?.status).toBe('revoked');
  expect(secondRow?.status).toBe('pending');
  expect(secondRow?.recipientEmail).toBe('segundo@example.invalid');
  expect(listing.body.requests.filter((row) => row.status === 'pending')).toHaveLength(1);

  const oldPublicLink = await request(page, `/api/public/signature?token=${encodeURIComponent(firstToken)}`);
  expect(oldPublicLink.status).toBe(409);
  expect(oldPublicLink.text).not.toContain('primero@example.invalid');
});
