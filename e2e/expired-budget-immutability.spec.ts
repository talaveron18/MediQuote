import { expect, test, type Page } from '@playwright/test';
import { db } from '../src/lib/db';

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = { totals: { calculationToken: string; totalFinal: number } };
type SavedBudget = {
  id: string;
  description: string | null;
  clientNotes: string | null;
  internalNotes: string | null;
  totalFinal: number;
  status: string;
};
type SavedPayload = { budget: SavedBudget };

async function api<T = unknown>(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<ApiResult<T>> {
  return page.evaluate(async ({ requestPath, requestMethod, requestBody }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      credentials: 'same-origin',
      cache: 'no-store',
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
  if (!password) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria');
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

function block(label: string, fixedPrice: number, date: string) {
  return {
    blockType: 'material',
    serviceName: label,
    professionalCategory: 'e2e-category-nursing',
    dateMode: 'range',
    dateRangeStart: date,
    dateRangeEnd: date,
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity: 1,
    pricePerHour: fixedPrice,
    fixedPrice,
    ivaPercent: 21,
  };
}

async function calculate(page: Page, label: string, fixedPrice: number, date: string) {
  const result = await api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [block(label, fixedPrice, date)],
    discountPercent: 0,
    ivaPercent: 21,
  });
  expect(result.status).toBe(200);
  return result.body;
}

async function createExpiredBudget(page: Page, marker: string) {
  const calculation = await calculate(page, `${marker} original`, 43, '2026-11-09');
  const saved = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001',
    calculationToken: calculation.totals.calculationToken,
    description: `${marker} original`,
    clientNotes: `${marker} client note`,
    internalNotes: `${marker} internal note`,
    status: 'borrador',
  });
  expect(saved.status).toBe(201);
  await db.budget.update({ where: { id: saved.body.budget.id }, data: { status: 'caducado' } });
  return { ...saved.body.budget, status: 'caducado' };
}

async function getBudget(page: Page, id: string) {
  const response = await api<{ budgets: SavedBudget[] }>(page, `/api/budgets?id=${encodeURIComponent(id)}`);
  expect(response.status).toBe(200);
  return response.body.budgets[0];
}

function expectExpiredConflict(result: ApiResult<{ error: string }>) {
  expect(result.status).toBe(409);
  expect(result.body.error).toMatch(/caducado.*cerrado/i);
}

test('1 · un caducado conserva inmutables descripción y notas', async ({ page }) => {
  await login(page);
  const original = await createExpiredBudget(page, `E2E expired document ${Date.now()}`);

  const attempted = await api<{ error: string }>(page, '/api/budgets', 'PUT', {
    id: original.id,
    description: 'MUTACIÓN CADUCADA',
    clientNotes: 'nota cliente que no debe persistir',
    internalNotes: 'nota interna que no debe persistir',
  });
  expectExpiredConflict(attempted);

  const persisted = await getBudget(page, original.id);
  expect(persisted.status).toBe('caducado');
  expect(persisted.description).toBe(original.description);
  expect(persisted.clientNotes).toBe(original.clientNotes);
  expect(persisted.internalNotes).toBe(original.internalNotes);
});

test('2 · un caducado no consume una cotización económica nueva', async ({ page }) => {
  await login(page);
  const original = await createExpiredBudget(page, `E2E expired economics ${Date.now()}`);
  const replacement = await calculate(page, 'E2E replacement retained after expiry', 113, '2026-11-10');

  const attempted = await api<{ error: string }>(page, '/api/budgets', 'PUT', {
    id: original.id,
    serviceBlocks: [],
    calculationToken: replacement.totals.calculationToken,
    description: 'recalculo que no debe aplicarse',
  });
  expectExpiredConflict(attempted);

  const persisted = await getBudget(page, original.id);
  expect(persisted.status).toBe('caducado');
  expect(persisted.totalFinal).toBe(original.totalFinal);

  const reuse = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001',
    calculationToken: replacement.totals.calculationToken,
    description: `E2E retained expired quote ${Date.now()}`,
    status: 'borrador',
  });
  expect(reuse.status).toBe(201);
  expect(reuse.body.budget.totalFinal).toBe(replacement.totals.totalFinal);
});

test('3 · un caducado no puede reabrirse por cambio directo de estado', async ({ page }) => {
  await login(page);
  const original = await createExpiredBudget(page, `E2E expired reopen ${Date.now()}`);

  const attempted = await api<{ error: string }>(page, '/api/budgets', 'PUT', {
    id: original.id,
    status: 'borrador',
    validUntil: '2027-01-31',
  });
  expectExpiredConflict(attempted);

  const persisted = await getBudget(page, original.id);
  expect(persisted.status).toBe('caducado');
});

test('4 · DELETE repetido no vuelve a sellar ni muta un caducado', async ({ page }) => {
  await login(page);
  const original = await createExpiredBudget(page, `E2E expired delete ${Date.now()}`);
  const artifactsBefore = await db.budgetHistory.count({
    where: { budgetId: original.id, action: 'sealed_budget_artifact' },
  });

  const attempted = await api<{ error: string }>(
    page,
    `/api/budgets?id=${encodeURIComponent(original.id)}`,
    'DELETE',
  );
  expectExpiredConflict(attempted);

  const persisted = await getBudget(page, original.id);
  const artifactsAfter = await db.budgetHistory.count({
    where: { budgetId: original.id, action: 'sealed_budget_artifact' },
  });
  expect(persisted.status).toBe('caducado');
  expect(artifactsAfter).toBe(artifactsBefore);
});
