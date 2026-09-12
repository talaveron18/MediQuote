import { expect, test, type Page } from '@playwright/test';
import { db } from '../src/lib/db';

type ApiResult<T = unknown> = { status: number; body: T; cacheControl: string | null };
type Calculation = { totals: { calculationToken: string; totalFinal: number } };
type SavedPayload = { budget: { id: string; status: string; description: string | null; totalFinal: number } };

async function api<T = unknown>(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
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
    return { status: response.status, body: parsed, cacheControl: response.headers.get('cache-control') };
  }, { requestPath: path, requestMethod: method, requestBody: body }) as Promise<ApiResult<T>>;
}

async function rawJson(page: Page, method: 'POST' | 'PUT', rawBody: string): Promise<ApiResult<{ error?: string }>> {
  return page.evaluate(async ({ requestMethod, payload }) => {
    const response = await fetch('/api/budgets', {
      method: requestMethod,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    return { status: response.status, body: parsed, cacheControl: response.headers.get('cache-control') };
  }, { requestMethod: method, payload: rawBody }) as Promise<ApiResult<{ error?: string }>>;
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

async function calculate(page: Page, marker: string, fixedPrice = 47) {
  const result = await api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [block(marker, fixedPrice, '2026-11-19')],
    discountPercent: 0,
    ivaPercent: 21,
  });
  expect(result.status).toBe(200);
  return result.body;
}

async function saveWithToken(page: Page, token: string, description: string) {
  const result = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001',
    calculationToken: token,
    description,
    status: 'borrador',
  });
  expect(result.status).toBe(201);
  return result.body.budget;
}

function expectPrivateBadRequest(result: ApiResult<{ error?: string }>) {
  expect(result.status).toBe(400);
  expect(result.body.error).toBeTruthy();
  expect(result.cacheControl).toContain('private');
  expect(result.cacheControl).toContain('no-store');
}

test('1 · POST con JSON malformado devuelve 400 sin consumir una cotización válida', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page, `E2E malformed create ${Date.now()}`);
  const quoteBefore = await db.costingQuote.findUnique({ where: { id: calculation.totals.calculationToken } });
  expect(quoteBefore?.usedAt).toBeNull();

  const rejected = await rawJson(page, 'POST', `{"clientId":"e2e-client-001","calculationToken":"${calculation.totals.calculationToken}"`);
  expectPrivateBadRequest(rejected);

  const quoteAfter = await db.costingQuote.findUnique({ where: { id: calculation.totals.calculationToken } });
  expect(quoteAfter?.usedAt).toBeNull();
  await saveWithToken(page, calculation.totals.calculationToken, `E2E malformed token retained ${Date.now()}`);
});

test('2 · PUT con JSON malformado devuelve 400 sin crear historia ni artefactos', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page, `E2E malformed update ${Date.now()}`);
  const budget = await saveWithToken(page, calculation.totals.calculationToken, 'E2E malformed update original');
  const historiesBefore = await db.budgetHistory.count({ where: { budgetId: budget.id } });

  const rejected = await rawJson(page, 'PUT', `{"id":"${budget.id}","description":`);
  expectPrivateBadRequest(rejected);

  const persisted = await db.budget.findUnique({ where: { id: budget.id } });
  const historiesAfter = await db.budgetHistory.count({ where: { budgetId: budget.id } });
  expect(persisted?.description).toBe('E2E malformed update original');
  expect(historiesAfter).toBe(historiesBefore);
});

test('3 · POST rechaza un status fuera del contrato antes de consumir la cotización', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page, `E2E invalid create status ${Date.now()}`);

  const rejected = await api<{ error?: string }>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001',
    calculationToken: calculation.totals.calculationToken,
    description: 'E2E status inválido',
    status: 'estado-inventado',
  });
  expectPrivateBadRequest(rejected);

  const quote = await db.costingQuote.findUnique({ where: { id: calculation.totals.calculationToken } });
  expect(quote?.usedAt).toBeNull();
  const saved = await saveWithToken(page, calculation.totals.calculationToken, `E2E invalid status token retained ${Date.now()}`);
  expect(saved.status).toBe('borrador');
});

test('4 · PUT rechaza un status fuera del contrato sin mutar presupuesto, historia ni artefacto', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page, `E2E invalid update status ${Date.now()}`);
  const budget = await saveWithToken(page, calculation.totals.calculationToken, 'E2E invalid status original');
  const historiesBefore = await db.budgetHistory.count({ where: { budgetId: budget.id } });
  const sealedBefore = await db.budgetHistory.count({ where: { budgetId: budget.id, action: 'sealed_budget_artifact' } });

  const rejected = await api<{ error?: string }>(page, '/api/budgets', 'PUT', {
    id: budget.id,
    status: 'aceptado-a-mano',
    description: 'NO DEBE PERSISTIR',
  });
  expectPrivateBadRequest(rejected);

  const persisted = await db.budget.findUnique({ where: { id: budget.id } });
  const historiesAfter = await db.budgetHistory.count({ where: { budgetId: budget.id } });
  const sealedAfter = await db.budgetHistory.count({ where: { budgetId: budget.id, action: 'sealed_budget_artifact' } });
  expect(persisted?.status).toBe('borrador');
  expect(persisted?.description).toBe('E2E invalid status original');
  expect(historiesAfter).toBe(historiesBefore);
  expect(sealedAfter).toBe(sealedBefore);
});
