import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';
const nursingCategory = 'e2e-category-nursing';
const medicineCategory = 'e2e-category-medicine';
const validSignatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = {
  blocks: Array<{ blockIndex: number; category: string; totalWithVat: number }>;
  totals: { subtotal: number; discountAmount: number; ivaAmount: number; totalFinal: number; calculationToken: string };
  commercial: { status: string };
};
type CreatedBudget = { budget: { id: string; code: string; status: string } };
type BudgetSnapshot = { version: number; hash: string; payload: { serviceBlocks: Array<{ serviceName: string; professionalCategory?: string; sortOrder?: number }>; totalFinal: number } };
type ReopenedBudget = { id: string; code: string; status: string; serviceBlocks: Array<{ serviceName: string; professionalCategory?: string; sortOrder?: number }>; totalFinal: number };

async function api<T = unknown>(page: Page, path: string, options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<ApiResult<T>> {
  return page.evaluate(async ({ requestPath, method, requestBody }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { status: response.status, body };
  }, { requestPath: path, method: options.method ?? 'GET', requestBody: options.body }) as Promise<ApiResult<T>>;
}

async function login(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(maestroPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

function block(label: string, category: string, date: string, shiftType: string, fixedPrice: number, sortOrder: number) {
  return {
    blockType: 'material', serviceName: label, professionalCategory: category, dateMode: 'range',
    dateRangeStart: date, dateRangeEnd: date, shiftType, hoursPerDay: 8,
    unitType: 'unidad', quantity: 1, pricePerHour: fixedPrice, fixedPrice, ivaPercent: 21, sortOrder,
  };
}

async function calculate(page: Page, blocks: unknown[]) {
  const result = await api<Calculation>(page, '/api/calculations', {
    method: 'POST', body: { blocks, discountPercent: 0, ivaPercent: 21 },
  });
  expect(result.status).toBe(200);
  expect(result.body.commercial.status).toBe('calculated');
  expect(result.body.totals.calculationToken).toBeTruthy();
  return result.body;
}

async function createBudget(page: Page, calculation: Calculation, marker: string) {
  const result = await api<CreatedBudget>(page, '/api/budgets', {
    method: 'POST',
    body: { clientId: 'e2e-client-001', calculationToken: calculation.totals.calculationToken, description: marker, status: 'borrador' },
  });
  expect(result.status).toBe(201);
  return result.body;
}

async function snapshots(page: Page, budgetId: string) {
  const result = await api<{ artifacts: Array<{ version: number; hash: string; payload: BudgetSnapshot['payload'] }> }>(page, `/api/budgets?id=${encodeURIComponent(budgetId)}&artifacts=1`);
  expect(result.status).toBe(200);
  return result.body.artifacts;
}

async function reopenBudget(page: Page, code: string) {
  const result = await api<{ budgets: ReopenedBudget[] }>(page, '/api/budgets');
  expect(result.status).toBe(200);
  const budget = result.body.budgets.find((item) => item.code === code);
  expect(budget).toBeTruthy();
  return budget!;
}

test('1 · presupuesto multibloque guarda, reabre y recarga con totales servidor e instantánea inmutable', async ({ page }) => {
  await login(page);
  const blocks = [
    block('Enfermería mañana', nursingCategory, '2026-10-13', 'morning', 40, 0),
    block('Medicina tarde', medicineCategory, '2026-10-14', 'afternoon', 75, 1),
  ];
  const calculation = await calculate(page, blocks);
  expect(calculation.blocks).toHaveLength(2);

  const created = await createBudget(page, calculation, 'E2E ciclo presupuesto');
  const reopened = await reopenBudget(page, created.budget.code);
  expect(reopened.serviceBlocks.map((item) => item.serviceName)).toEqual(['Enfermería mañana', 'Medicina tarde']);
  expect(reopened.serviceBlocks.map((item) => item.professionalCategory)).toEqual([nursingCategory, medicineCategory]);
  expect(reopened.totalFinal).toBe(calculation.totals.totalFinal);

  const sealed = await snapshots(page, created.budget.id);
  expect(sealed).toHaveLength(1);
  expect(sealed[0].version).toBe(1);
  expect(sealed[0].hash).toMatch(/^[a-f0-9]{64}$/);
  expect(sealed[0].payload.totalFinal).toBe(calculation.totals.totalFinal);

  await page.reload();
  const afterReload = await reopenBudget(page, created.budget.code);
  expect(afterReload.totalFinal).toBe(calculation.totals.totalFinal);
});

test('2 · edición económica produce v2 distinta y preserva v1 sin mutación', async ({ page }) => {
  await login(page);
  const v1Blocks = [
    block('Bloque A v1', nursingCategory, '2026-10-15', 'morning', 30, 0),
    block('Bloque B v1', medicineCategory, '2026-10-16', 'night', 70, 1),
  ];
  const calcV1 = await calculate(page, v1Blocks);
  const created = await createBudget(page, calcV1, 'E2E versionado v1');
  const v1Artifacts = await snapshots(page, created.budget.id);
  const v1Hash = v1Artifacts[0].hash;

  const v2Blocks = [
    block('Bloque B v2', medicineCategory, '2026-10-16', 'night', 70, 0),
    block('Bloque A v2', nursingCategory, '2026-10-15', 'morning', 55, 1),
  ];
  const calcV2 = await calculate(page, v2Blocks);
  const edited = await api(page, '/api/budgets', {
    method: 'PUT',
    body: { id: created.budget.id, serviceBlocks: [], calculationToken: calcV2.totals.calculationToken, description: 'E2E versionado v2' },
  });
  expect(edited.status).toBe(200);

  const artifacts = await snapshots(page, created.budget.id);
  expect(artifacts).toHaveLength(2);
  expect(artifacts.map((item) => item.version)).toEqual([1, 2]);
  expect(artifacts[0].hash).toBe(v1Hash);
  expect(artifacts[1].hash).not.toBe(v1Hash);
  expect(artifacts[0].payload.serviceBlocks.map((item) => item.serviceName)).toEqual(['Bloque A v1', 'Bloque B v1']);
  expect(artifacts[1].payload.serviceBlocks.map((item) => item.serviceName)).toEqual(['Bloque B v2', 'Bloque A v2']);
  expect(artifacts[1].payload.totalFinal).toBe(calcV2.totals.totalFinal);

  await page.goto('/');
  await page.goBack();
  const reopened = await reopenBudget(page, created.budget.code);
  expect(reopened.serviceBlocks.map((item) => item.serviceName)).toEqual(['Bloque B v2', 'Bloque A v2']);
  expect(reopened.totalFinal).toBe(calcV2.totals.totalFinal);
});

test('3 · doble guardado consume un cálculo una sola vez y crea exactamente un presupuesto', async ({ page }) => {
  await login(page);
  const marker = `E2E doble guardado ${Date.now()}`;
  const calculation = await calculate(page, [block(marker, nursingCategory, '2026-10-17', 'morning', 42, 0)]);

  const outcomes = await page.evaluate(async ({ token, description }) => {
    const payload = JSON.stringify({ clientId: 'e2e-client-001', calculationToken: token, description, status: 'borrador' });
    const save = async () => {
      const response = await fetch('/api/budgets', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: payload });
      return { status: response.status, body: await response.json() };
    };
    return Promise.all([save(), save()]);
  }, { token: calculation.totals.calculationToken, description: marker });

  expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([201, 409]);
  const listing = await api<{ budgets: Array<{ description?: string }> }>(page, '/api/budgets');
  expect(listing.status).toBe(200);
  expect(listing.body.budgets.filter((budget) => budget.description === marker)).toHaveLength(1);
});

test('4 · documento cliente y firma electrónica recorren el presupuesto sin filtrar economía interna', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page, [
    block('Enfermería presencial', nursingCategory, '2026-10-18', 'morning', 44, 0),
    block('Medicina remota', medicineCategory, '2026-10-18', 'afternoon', 88, 1),
  ]);
  const created = await createBudget(page, calculation, 'E2E documento y firma');

  const document = await page.evaluate(async (budgetId) => {
    const response = await fetch(`/api/pdf?id=${encodeURIComponent(budgetId)}&mode=client`, { credentials: 'same-origin' });
    return { status: response.status, html: await response.text() };
  }, created.budget.id);
  expect(document.status).toBe(200);
  expect(document.html).toContain('Enfermería presencial');
  expect(document.html).toContain('Medicina remota');
  expect(document.html).not.toContain(nursingCategory);
  expect(document.html).not.toContain(medicineCategory);
  expect(document.html).not.toMatch(/coste interno|margen interno|comisión comercial/i);

  const signatureRequest = await api<{ id: string; signingUrl: string }>(page, '/api/signatures', {
    method: 'POST',
    body: { budgetId: created.budget.id, recipientEmail: 'cliente@example.invalid' },
  });
  expect(signatureRequest.status).toBe(201);
  const token = new URL(signatureRequest.body.signingUrl).pathname.split('/').pop()!;

  const publicReview = await api<{ status: string; budget: { code: string; totalFinal: number } }>(page, `/api/public/signature?token=${encodeURIComponent(token)}`);
  expect(publicReview.status).toBe(200);
  expect(publicReview.body.status).toBe('pending');
  expect(publicReview.body.budget.code).toBe(created.budget.code);
  expect(publicReview.body.budget.totalFinal).toBe(calculation.totals.totalFinal);

  const acceptanceBody = {
    token,
    signerName: 'Cliente Sintético E2E',
    signerEmail: 'cliente@example.invalid',
    signatureData: validSignatureData,
    consent: true,
  };
  const accepted = await api<{ status: string }>(page, '/api/public/signature', { method: 'POST', body: acceptanceBody });
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');

  const duplicate = await api<{ status: string; error: string }>(page, '/api/public/signature', { method: 'POST', body: acceptanceBody });
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.status).toBe('accepted');

  const reopened = await reopenBudget(page, created.budget.code);
  expect(reopened.status).toBe('aceptado');

  const certificate = await page.evaluate(async (certificateId) => {
    const response = await fetch(`/api/signatures?certificate=${encodeURIComponent(certificateId)}`, { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  }, signatureRequest.body.id);
  expect(certificate.status).toBe(200);
  expect(certificate.body.signatureRequest.status).toBe('accepted');
  expect(certificate.body.signatureRequest.budget.code).toBe(created.budget.code);
});
