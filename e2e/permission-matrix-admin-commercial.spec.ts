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

const validSignatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type Role = keyof typeof credentials;
type BrowserResponse<T = unknown> = { status: number; headers: Record<string, string>; body: T; text: string };
type Calculation = { totals: { calculationToken: string; totalFinal: number } };
type SavedBudget = { budget: { id: string; code: string; description: string | null; createdById: string; totalFinal: number } };
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

function block(label: string, price = 29) {
  return {
    blockType: 'material', serviceName: label, professionalCategory: 'e2e-category-nursing',
    dateMode: 'range', dateRangeStart: '2026-10-21', dateRangeEnd: '2026-10-21',
    shiftType: 'morning', hoursPerDay: 8, unitType: 'unidad', quantity: 2,
    pricePerHour: price, fixedPrice: price, ivaPercent: 21,
  };
}

async function createBudget(page: Page, marker: string): Promise<SavedBudget['budget']> {
  const calculation = await request<Calculation>(page, '/api/calculations', {
    method: 'POST', body: { blocks: [block(marker)], discountPercent: 0, ivaPercent: 21 },
  });
  expect(calculation.status).toBe(200);
  const saved = await request<SavedBudget>(page, '/api/budgets', {
    method: 'POST',
    body: { clientId: 'e2e-client-001', calculationToken: calculation.body.totals.calculationToken, description: marker, status: 'borrador' },
  });
  expect(saved.status).toBe(201);
  return saved.body.budget;
}

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toContain('private');
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.headers.pragma).toBe('no-cache');
  expect(response.headers.expires).toBe('0');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

test('1 · comercial conserva acceso funcional a su presupuesto y documentos, sin costes internos', async ({ page }) => {
  await login(page, 'comercial');
  const budget = await createBudget(page, `E2E matrix comercial own ${Date.now()}`);

  const opened = await request<{ budgets: Array<{ id: string; internalNotes?: unknown; serviceBlocks: Array<Record<string, unknown>> }> }>(
    page, `/api/budgets?id=${encodeURIComponent(budget.id)}`,
  );
  expect(opened.status).toBe(200);
  expect(opened.body.budgets).toHaveLength(1);
  expect(opened.body.budgets[0].internalNotes).toBeUndefined();
  expect(opened.body.budgets[0].serviceBlocks[0].internalCostPerHour).toBeUndefined();
  expect(opened.body.budgets[0].serviceBlocks[0].internalMargin).toBeUndefined();

  const clientPdf = await request(page, `/api/pdf?id=${encodeURIComponent(budget.id)}&mode=client`);
  const commercialPdf = await request(page, `/api/pdf?id=${encodeURIComponent(budget.id)}&mode=commercial`);
  expect(clientPdf.status).toBe(200);
  expect(commercialPdf.status).toBe(200);
  expect(commercialPdf.text).toContain('DOCUMENTO COMERCIAL — USO INTERNO');
  expect(commercialPdf.text).toContain('Comisión estimada del comercial');
  expect(commercialPdf.text).not.toContain('Coste interno');
  expect(commercialPdf.text).not.toContain('internalCostPerHour');
  expect(clientPdf.text).not.toContain('Comisión estimada del comercial');
});

test('2 · admin puede abrir y editar presupuesto ajeno sin romper la propiedad comercial ni exponer coste en PDF comercial', async ({ page }) => {
  await login(page, 'comercial');
  const marker = `E2E matrix admin cross-owner ${Date.now()}`;
  const budget = await createBudget(page, marker);
  await clearSession(page);

  await login(page, 'admin');
  const opened = await request<{ budgets: Array<{ id: string; description: string }> }>(page, `/api/budgets?id=${encodeURIComponent(budget.id)}`);
  expect(opened.status).toBe(200);
  expect(opened.body.budgets[0].description).toBe(marker);

  const editedMarker = `${marker} · admin`;
  const edited = await request<{ budget: { id: string; description: string; createdById: string } }>(page, '/api/budgets', {
    method: 'PUT', body: { id: budget.id, description: editedMarker },
  });
  expect(edited.status).toBe(200);
  expect(edited.body.budget.description).toBe(editedMarker);
  expect(edited.body.budget.createdById).toBe(budget.createdById);

  const clientPdf = await request(page, `/api/pdf?id=${encodeURIComponent(budget.id)}&mode=client`);
  const commercialPdf = await request(page, `/api/pdf?id=${encodeURIComponent(budget.id)}&mode=commercial`);
  expect(clientPdf.status).toBe(200);
  expect(commercialPdf.status).toBe(200);
  expect(commercialPdf.text).not.toContain('Coste interno');
  expect(commercialPdf.text).not.toContain('internalCostPerHour');
});

test('3 · firma respeta propiedad del comercial y acceso transversal documentado de admin/maestro', async ({ page }) => {
  await login(page, 'comercial');
  const budget = await createBudget(page, `E2E matrix signature ${Date.now()}`);
  const created = await request<SignatureCreated>(page, '/api/signatures', {
    method: 'POST', body: { budgetId: budget.id, recipientEmail: 'cliente@example.invalid' },
  });
  expect(created.status).toBe(201);
  const token = new URL(created.body.signingUrl).pathname.split('/').pop()!;

  const listing = await request<{ requests: Array<{ id: string }> }>(page, `/api/signatures?budgetId=${encodeURIComponent(budget.id)}`);
  expect(listing.status).toBe(200);
  expect(listing.body.requests.some((item) => item.id === created.body.id)).toBe(true);

  const accepted = await request<{ status: string }>(page, '/api/public/signature', {
    method: 'POST', body: {
      token, signerName: 'Cliente Sintético E2E', signerEmail: 'cliente@example.invalid',
      signatureData: validSignatureData, consent: true,
    },
  });
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');

  const ownerCertificate = await request(page, `/api/signatures?certificate=${encodeURIComponent(created.body.id)}`);
  expect(ownerCertificate.status).toBe(200);
  expect(ownerCertificate.text).toContain('Certificado de aceptación electrónica');
  await clearSession(page);

  for (const role of ['admin', 'maestro'] as const) {
    await login(page, role);
    const crossListing = await request<{ requests: Array<{ id: string }> }>(page, `/api/signatures?budgetId=${encodeURIComponent(budget.id)}`);
    const crossCertificate = await request(page, `/api/signatures?certificate=${encodeURIComponent(created.body.id)}`);
    expect(crossListing.status).toBe(200);
    expect(crossListing.body.requests.some((item) => item.id === created.body.id)).toBe(true);
    expect(crossCertificate.status).toBe(200);
    expect(crossCertificate.text).toContain('Certificado de aceptación electrónica');
    await clearSession(page);
  }
});

test('4 · auditoría permanece restringida a admin/maestro y logs sensibles son private/no-store', async ({ page }) => {
  await login(page, 'comercial');
  const commercialLogs = await request(page, '/api/audit-logs');
  const commercialCosts = await request(page, '/api/cost-audits');
  const commercialPackage = await request(page, '/api/audit-package?type=invalid', { method: 'POST' });
  expect(commercialLogs.status).toBe(403);
  expect(commercialCosts.status).toBe(403);
  expect(commercialPackage.status).toBe(403);
  await clearSession(page);

  for (const role of ['admin', 'maestro'] as const) {
    await login(page, role);
    const logs = await request(page, '/api/audit-logs');
    const costs = await request(page, '/api/cost-audits');
    const invalidPackage = await request(page, '/api/audit-package?type=invalid', { method: 'POST' });
    expect(logs.status).toBe(200);
    expect(costs.status).toBe(200);
    expect(invalidPackage.status).toBe(400);
    expectPrivateNoStore(logs);
    await clearSession(page);
  }
});
