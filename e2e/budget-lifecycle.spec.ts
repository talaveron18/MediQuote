import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';
const nursingCategory = 'e2e-category-nursing';
const medicineCategory = 'e2e-category-medicine';

type ApiResult<T = unknown> = { status: number; ok: boolean; body: T };

type Calculation = {
  totals: {
    subtotal: number;
    discountAmount: number;
    ivaAmount: number;
    totalFinal: number;
    calculationToken: string;
  };
  commercial: { status: string };
};

type SavedBudget = {
  id: string;
  code: string;
  description: string | null;
  subtotal: number;
  discountAmount: number;
  ivaAmount: number;
  totalFinal: number;
  status: string;
  serviceBlocks: Array<{
    serviceName: string;
    professionalCategory: string;
    sortOrder: number;
    blockTotalFinal: number;
  }>;
};

async function api<T = unknown>(
  page: Page,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {},
): Promise<ApiResult<T>> {
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
    return { status: response.status, ok: response.ok, body };
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

function syntheticBlocks(order: 'normal' | 'reversed' = 'normal') {
  const blocks = [
    {
      blockType: 'material', serviceName: 'Material E2E centro norte', professionalCategory: nursingCategory,
      dateMode: 'range', dateRangeStart: '2026-10-05', dateRangeEnd: '2026-10-05',
      shiftType: 'morning', hoursPerDay: 8, unitType: 'unidad', quantity: 2, pricePerHour: 13, fixedPrice: 13,
      ivaPercent: 21,
    },
    {
      blockType: 'curso', serviceName: 'Formación E2E centro sur', professionalCategory: medicineCategory,
      dateMode: 'specific', specificDates: ['2026-10-06', '2026-10-08'],
      shiftType: 'afternoon', hoursPerDay: 4, unitType: 'unidad', quantity: 1, pricePerHour: 29, fixedPrice: 29,
      ivaPercent: 21,
    },
  ];
  return order === 'normal' ? blocks : [blocks[1], blocks[0]];
}

async function calculate(page: Page, order: 'normal' | 'reversed' = 'normal') {
  const result = await api<Calculation>(page, '/api/calculations', {
    method: 'POST',
    body: { blocks: syntheticBlocks(order), discountPercent: 0, ivaPercent: 21 },
  });
  expect(result.status).toBe(200);
  expect(result.body.commercial.status).toBe('calculated');
  expect(result.body.totals.calculationToken).toBeTruthy();
  return result.body;
}

async function createBudget(page: Page, marker: string, calculation: Calculation) {
  const result = await api<{ budget: SavedBudget; immutableArtifact: { version: number; artifactHash: string } }>(page, '/api/budgets', {
    method: 'POST',
    body: {
      clientId: 'e2e-client-001',
      calculationToken: calculation.totals.calculationToken,
      description: marker,
      status: 'borrador',
    },
  });
  expect(result.status).toBe(201);
  return result.body;
}

async function reopenBudget(page: Page, code: string) {
  const result = await api<{ budgets: SavedBudget[] }>(page, `/api/budgets?search=${encodeURIComponent(code)}`);
  expect(result.status).toBe(200);
  expect(result.body.budgets).toHaveLength(1);
  return result.body.budgets[0];
}

test('1 · presupuesto multibloque se guarda y reabre con orden y totales del servidor', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page);
  const created = await createBudget(page, 'E2E persistencia guardar-reabrir', calculation);

  expect(created.immutableArtifact.version).toBe(1);
  expect(created.immutableArtifact.artifactHash).toMatch(/^[a-f0-9]{64}$/);

  const reopened = await reopenBudget(page, created.budget.code);
  expect(reopened.description).toBe('E2E persistencia guardar-reabrir');
  expect(reopened.serviceBlocks.map((block) => block.serviceName)).toEqual([
    'Material E2E centro norte',
    'Formación E2E centro sur',
  ]);
  expect(reopened.serviceBlocks.map((block) => block.professionalCategory)).toEqual([
    nursingCategory,
    medicineCategory,
  ]);
  expect(reopened.serviceBlocks.map((block) => block.sortOrder)).toEqual([0, 1]);
  expect(reopened.subtotal).toBe(calculation.totals.subtotal);
  expect(reopened.discountAmount).toBe(calculation.totals.discountAmount);
  expect(reopened.ivaAmount).toBe(calculation.totals.ivaAmount);
  expect(reopened.totalFinal).toBe(calculation.totals.totalFinal);

  await page.reload();
  const afterReload = await reopenBudget(page, created.budget.code);
  expect(afterReload.totalFinal).toBe(reopened.totalFinal);
});

test('2 · editar económicamente crea v2 inmutable y persiste el nuevo orden tras navegación', async ({ page }) => {
  await login(page);
  const initialCalculation = await calculate(page);
  const created = await createBudget(page, 'E2E edición versionada', initialCalculation);
  const editedCalculation = await calculate(page, 'reversed');

  const edited = await api<{ budget: SavedBudget; immutableArtifact: { version: number; artifactHash: string } }>(page, '/api/budgets', {
    method: 'PUT',
    body: {
      id: created.budget.id,
      serviceBlocks: [],
      calculationToken: editedCalculation.totals.calculationToken,
      description: 'E2E edición versionada v2',
    },
  });
  expect(edited.status).toBe(200);
  expect(edited.body.immutableArtifact.version).toBe(2);
  expect(edited.body.immutableArtifact.artifactHash).toMatch(/^[a-f0-9]{64}$/);
  expect(edited.body.immutableArtifact.artifactHash).not.toBe(created.immutableArtifact.artifactHash);

  const reopened = await reopenBudget(page, created.budget.code);
  expect(reopened.description).toBe('E2E edición versionada v2');
  expect(reopened.serviceBlocks.map((block) => block.serviceName)).toEqual([
    'Formación E2E centro sur',
    'Material E2E centro norte',
  ]);
  expect(reopened.totalFinal).toBe(editedCalculation.totals.totalFinal);

  await page.goto('/recuperar-password');
  await page.goBack();
  await expect(page).toHaveURL('/');
  const afterBack = await reopenBudget(page, created.budget.code);
  expect(afterBack.serviceBlocks.map((block) => block.sortOrder)).toEqual([0, 1]);
});

test('3 · doble guardado concurrente consume la cotización una sola vez', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page);
  const payload = {
    clientId: 'e2e-client-001', calculationToken: calculation.totals.calculationToken,
    description: 'E2E doble guardado protegido', status: 'borrador',
  };

  const results = await page.evaluate(async (body) => {
    const save = () => fetch('/api/budgets', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(async (response) => ({ status: response.status, body: await response.json() }));
    return Promise.all([save(), save()]);
  }, payload);

  expect(results.map((result) => result.status).sort((a, b) => a - b)).toEqual([201, 409]);
  const success = results.find((result) => result.status === 201)!;
  const conflict = results.find((result) => result.status === 409)!;
  expect((conflict.body as { error: string }).error).toMatch(/cotización económica/i);

  const code = (success.body as { budget: SavedBudget }).budget.code;
  const reopened = await reopenBudget(page, code);
  expect(reopened.description).toBe('E2E doble guardado protegido');
});

test('4 · documento cliente y firma electrónica recorren el presupuesto sin filtrar economía interna', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page);
  const created = await createBudget(page, 'E2E documento y firma', calculation);

  const document = await page.evaluate(async (budgetId) => {
    const response = await fetch(`/api/pdf?id=${encodeURIComponent(budgetId)}&mode=client`, { credentials: 'same-origin' });
    return { status: response.status, contentType: response.headers.get('content-type'), html: await response.text() };
  }, created.budget.id);
  expect(document.status).toBe(200);
  expect(document.contentType).toContain('text/html');
  expect(document.html).toContain(created.budget.code);
  expect(document.html).toContain('E2E Enfermería sintética');
  expect(document.html).toContain('E2E Medicina sintética');
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
    signatureData: 'data:image/png;base64,iVBORw0KGgo=',
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
    return { status: response.status, html: await response.text() };
  }, signatureRequest.body.id);
  expect(certificate.status).toBe(200);
  expect(certificate.html).toContain('Certificado de aceptación electrónica');
  expect(certificate.html).toContain(created.budget.code);
});
