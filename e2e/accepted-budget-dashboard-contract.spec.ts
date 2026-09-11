import { expect, test, type Locator, type Page } from '@playwright/test';

const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = { totals: { calculationToken: string; totalFinal: number } };
type SavedBudget = { id: string; code: string; status: string; description: string | null; totalFinal: number };
type SavedPayload = { budget: SavedBudget };
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

function block(label: string) {
  return {
    blockType: 'material',
    serviceName: label,
    professionalCategory: 'e2e-category-nursing',
    dateMode: 'range',
    dateRangeStart: '2026-12-10',
    dateRangeEnd: '2026-12-10',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity: 1,
    pricePerHour: 41,
    fixedPrice: 41,
    ivaPercent: 21,
  };
}

async function createAcceptedBudget(page: Page, marker: string) {
  const calculation = await api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [block(marker)], discountPercent: 0, ivaPercent: 21,
  });
  expect(calculation.status).toBe(200);

  const saved = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001',
    calculationToken: calculation.body.totals.calculationToken,
    description: marker,
    status: 'borrador',
  });
  expect(saved.status).toBe(201);

  const signature = await api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId: saved.body.budget.id,
    recipientEmail: 'accepted.dashboard@example.invalid',
  });
  expect(signature.status).toBe(201);

  const token = new URL(signature.body.signingUrl).pathname.split('/').pop()!;
  const accepted = await api<{ status: string }>(page, '/api/public/signature', 'POST', {
    token,
    signerName: 'Cliente Dashboard E2E',
    signerEmail: 'accepted.dashboard@example.invalid',
    signatureData: validPng,
    consent: true,
  });
  expect(accepted.status).toBe(200);

  return saved.body.budget;
}

async function acceptedRow(page: Page, marker: string): Promise<{ budget: SavedBudget; row: Locator }> {
  const budget = await createAcceptedBudget(page, marker);
  await page.goto('/');
  const row = page.getByTestId(`budget-row-${budget.id}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText(budget.code);
  await expect(row).toContainText('Aceptado');
  return { budget, row };
}

test('1 · un aceptado no ofrece Editar en el listado', async ({ page }) => {
  await login(page);
  const { row } = await acceptedRow(page, `E2E accepted no edit ${Date.now()}`);
  await expect(row.getByTitle('Editar')).toHaveCount(0);
});

test('2 · un aceptado no ofrece Eliminar ni una falsa caducidad desde UI', async ({ page }) => {
  await login(page);
  const { row } = await acceptedRow(page, `E2E accepted no delete ${Date.now()}`);
  await expect(row.getByTitle('Eliminar')).toHaveCount(0);
});

test('3 · el listado identifica explícitamente el aceptado como inmutable y lo conserva tras recarga', async ({ page }) => {
  await login(page);
  const marker = `E2E accepted locked ${Date.now()}`;
  const { budget, row } = await acceptedRow(page, marker);
  await expect(row.getByTestId(`accepted-lock-${budget.id}`)).toContainText('Inmutable');
  await page.reload();
  const reloaded = page.getByTestId(`budget-row-${budget.id}`);
  await expect(reloaded.getByTestId(`accepted-lock-${budget.id}`)).toContainText('Inmutable');
  await expect(reloaded.getByTitle('Editar')).toHaveCount(0);
  await expect(reloaded.getByTitle('Eliminar')).toHaveCount(0);
});

test('4 · la continuación desde un aceptado es duplicar como borrador que requiere recalcular sin mutar el original', async ({ page }) => {
  await login(page);
  const marker = `E2E accepted duplicate ${Date.now()}`;
  const { budget, row } = await acceptedRow(page, marker);
  const duplicate = row.getByTitle('Duplicar como borrador; requiere recalcular');
  await expect(duplicate).toBeVisible();
  await duplicate.click();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
  await expect(page.getByText('Resumen del presupuesto')).toHaveCount(0);
  const original = await api<{ budgets: SavedBudget[] }>(page, `/api/budgets?id=${encodeURIComponent(budget.id)}`);
  expect(original.status).toBe(200);
  expect(original.body.budgets[0].status).toBe('aceptado');
  expect(original.body.budgets[0].description).toBe(marker);
  expect(original.body.budgets[0].totalFinal).toBe(budget.totalFinal);
});
