import { expect, test, type Page } from '@playwright/test';
import { db } from '../src/lib/db';

type ApiResult<T = unknown> = { status: number; body: T; cacheControl: string | null };
type Calculation = { totals: { calculationToken: string } };
type SavedPayload = { budget: { id: string; description: string | null } };

async function api<T = unknown>(page: Page, method: 'POST' | 'PUT', body: unknown): Promise<ApiResult<T>> {
  return page.evaluate(async ({ requestMethod, requestBody }) => {
    const response = await fetch('/api/budgets', {
      method: requestMethod,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    return { status: response.status, body: parsed, cacheControl: response.headers.get('cache-control') };
  }, { requestMethod: method, requestBody: body }) as Promise<ApiResult<T>>;
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

function materialBlock(label: string) {
  return {
    blockType: 'material',
    serviceName: label,
    professionalCategory: 'e2e-category-nursing',
    dateMode: 'range',
    dateRangeStart: '2026-11-20',
    dateRangeEnd: '2026-11-20',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity: 1,
    pricePerHour: 47,
    fixedPrice: 47,
    ivaPercent: 21,
  };
}

async function calculate(page: Page, marker: string): Promise<Calculation> {
  return page.evaluate(async (label) => {
    const response = await fetch('/api/calculations', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: [materialBlockForBrowser(label)], discountPercent: 0, ivaPercent: 21 }),
    });
    return response.json();
    function materialBlockForBrowser(name: string) {
      return {
        blockType: 'material', serviceName: name, professionalCategory: 'e2e-category-nursing',
        dateMode: 'range', dateRangeStart: '2026-11-20', dateRangeEnd: '2026-11-20',
        shiftType: 'morning', hoursPerDay: 8, unitType: 'unidad', quantity: 1,
        pricePerHour: 47, fixedPrice: 47, ivaPercent: 21,
      };
    }
  }, marker) as Promise<Calculation>;
}

async function save(page: Page, token: string, description: string) {
  const result = await api<SavedPayload>(page, 'POST', {
    clientId: 'e2e-client-001', calculationToken: token, description, status: 'borrador',
  });
  expect(result.status).toBe(201);
  return result.body.budget;
}

function expectPrivate400(result: ApiResult<{ error?: string }>) {
  expect(result.status).toBe(400);
  expect(result.body.error).toBeTruthy();
  expect(result.cacheControl).toContain('private');
  expect(result.cacheControl).toContain('no-store');
}

test('POST rechaza campos fuera de allowlist sin consumir la cotización', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page, `E2E POST unknown ${Date.now()}`);
  const token = calculation.totals.calculationToken;
  const rejected = await api<{ error?: string }>(page, 'POST', {
    clientId: 'e2e-client-001', calculationToken: token, status: 'borrador', createdById: 'forged-user',
  });
  expectPrivate400(rejected);
  expect((await db.costingQuote.findUnique({ where: { id: token } }))?.usedAt).toBeNull();
});

test('POST rechaza tipos incompatibles antes de consumir la cotización', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page, `E2E POST types ${Date.now()}`);
  const token = calculation.totals.calculationToken;
  const rejected = await api<{ error?: string }>(page, 'POST', {
    clientId: 42, calculationToken: token, status: 'borrador', description: ['not-text'],
  });
  expectPrivate400(rejected);
  expect((await db.costingQuote.findUnique({ where: { id: token } }))?.usedAt).toBeNull();
});

test('PUT rechaza campos fuera de allowlist sin mutar presupuesto ni historia', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page, `E2E PUT unknown ${Date.now()}`);
  const budget = await save(page, calculation.totals.calculationToken, 'E2E contract original unknown');
  const historiesBefore = await db.budgetHistory.count({ where: { budgetId: budget.id } });
  const rejected = await api<{ error?: string }>(page, 'PUT', {
    id: budget.id, description: 'NO DEBE PERSISTIR', createdAt: '2099-01-01T00:00:00.000Z',
  });
  expectPrivate400(rejected);
  const persisted = await db.budget.findUnique({ where: { id: budget.id } });
  expect(persisted?.description).toBe('E2E contract original unknown');
  expect(await db.budgetHistory.count({ where: { budgetId: budget.id } })).toBe(historiesBefore);
});

test('PUT rechaza tipos incompatibles sin mutar ni consumir una nueva cotización', async ({ page }) => {
  await login(page);
  const initial = await calculate(page, `E2E PUT types initial ${Date.now()}`);
  const budget = await save(page, initial.totals.calculationToken, 'E2E contract original types');
  const recalculation = await calculate(page, `E2E PUT types recalc ${Date.now()}`);
  const token = recalculation.totals.calculationToken;
  const historiesBefore = await db.budgetHistory.count({ where: { budgetId: budget.id } });
  const rejected = await api<{ error?: string }>(page, 'PUT', {
    id: budget.id, calculationToken: token, serviceBlocks: {}, subtotal: '47', description: { forged: true },
  });
  expectPrivate400(rejected);
  expect((await db.costingQuote.findUnique({ where: { id: token } }))?.usedAt).toBeNull();
  const persisted = await db.budget.findUnique({ where: { id: budget.id } });
  expect(persisted?.description).toBe('E2E contract original types');
  expect(await db.budgetHistory.count({ where: { budgetId: budget.id } })).toBe(historiesBefore);
});
