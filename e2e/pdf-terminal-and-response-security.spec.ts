import { expect, test, type Page } from '@playwright/test';
import { db } from '../src/lib/db';

const password = process.env.E2E_MAESTRO_PASSWORD;

type ApiResult<T = unknown> = { status: number; body: T; headers: Record<string, string> };
type Calculation = { totals: { calculationToken: string } };
type Saved = { budget: { id: string } };

async function api<T = unknown>(page: Page, path: string, method = 'GET', body?: unknown): Promise<ApiResult<T>> {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    return { status: response.status, body: parsed, headers: Object.fromEntries(response.headers.entries()) };
  }, { path, method, body }) as Promise<ApiResult<T>>;
}

async function login(page: Page) {
  if (!password) throw new Error('E2E_MAESTRO_PASSWORD is required');
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function createBudget(page: Page, marker: string) {
  const calculation = await api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [{
      blockType: 'material', serviceName: marker, professionalCategory: 'e2e-category-nursing',
      dateMode: 'range', dateRangeStart: '2026-11-19', dateRangeEnd: '2026-11-19',
      shiftType: 'morning', hoursPerDay: 8, unitType: 'unidad', quantity: 1,
      pricePerHour: 31, fixedPrice: 31, ivaPercent: 21,
    }],
    discountPercent: 0, ivaPercent: 21,
  });
  expect(calculation.status).toBe(200);
  const saved = await api<Saved>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: calculation.body.totals.calculationToken,
    description: marker, status: 'borrador',
  });
  expect(saved.status).toBe(201);
  return saved.body.budget.id;
}

test.beforeEach(async ({ page }) => { await login(page); });

test('PDF rechazado no ofrece envío para firma', async ({ page }) => {
  const budgetId = await createBudget(page, `PDF rechazado ${Date.now()}`);
  await db.budget.update({ where: { id: budgetId }, data: { status: 'rechazado' } });

  const document = await api<string>(page, `/api/pdf?id=${encodeURIComponent(budgetId)}&mode=client`);
  expect(document.status).toBe(200);
  const html = String(document.body);
  expect(html).toContain('RECHAZADO');
  expect(html).not.toContain('Enviar al cliente para firma');
  expect(html).not.toContain('sendBudgetForSignature');
});

test('PDF autenticado impide framing y fuga de referrer', async ({ page }) => {
  const budgetId = await createBudget(page, `PDF headers ${Date.now()}`);
  const document = await api<string>(page, `/api/pdf?id=${encodeURIComponent(budgetId)}&mode=client`);
  expect(document.status).toBe(200);
  expect(document.headers['cache-control']).toContain('private');
  expect(document.headers['cache-control']).toContain('no-store');
  expect(document.headers['pragma']).toBe('no-cache');
  expect(document.headers['x-content-type-options']).toBe('nosniff');
  expect(document.headers['x-frame-options']).toBe('DENY');
  expect(document.headers['referrer-policy']).toBe('no-referrer');
});
