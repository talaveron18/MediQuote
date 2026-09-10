import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';

type ApiResult<T = unknown> = { status: number; body: T };
type SavedBudget = { id: string; code: string; description: string | null; totalFinal: number };
type Calculation = { totals: { calculationToken: string; totalFinal: number } };
type SavedPayload = { budget: SavedBudget; immutableArtifact: { version: number; artifactHash: string } };

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
    if (text) { try { body = JSON.parse(text); } catch { body = text; } }
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

function block(price = 13, quantity = 2) {
  return {
    blockType: 'material', serviceName: 'Material edit navigation E2E', professionalCategory: 'e2e-category-nursing',
    dateMode: 'range', dateRangeStart: '2026-10-05', dateRangeEnd: '2026-10-05', shiftType: 'morning', hoursPerDay: 8,
    unitType: 'unidad', quantity, pricePerHour: price, fixedPrice: price, ivaPercent: 21,
  };
}

async function calculate(page: Page, price = 13, quantity = 2) {
  const result = await api<Calculation>(page, '/api/calculations', { method: 'POST', body: { blocks: [block(price, quantity)], discountPercent: 0, ivaPercent: 21 } });
  expect(result.status).toBe(200);
  return result.body;
}

async function createBudget(page: Page, marker: string) {
  const calculation = await calculate(page);
  const result = await api<SavedPayload>(page, '/api/budgets', { method: 'POST', body: { clientId: 'e2e-client-001', calculationToken: calculation.totals.calculationToken, description: marker, status: 'borrador' } });
  expect(result.status).toBe(201);
  return result.body;
}

async function openEdit(page: Page, code: string) {
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  const search = page.getByPlaceholder('Buscar por código, descripción o cliente...');
  await search.fill(code);
  await search.press('Enter');
  const row = page.getByRole('row').filter({ hasText: code });
  await expect(row).toHaveCount(1);
  await row.getByTitle('Editar').click();
  await expect(page.getByRole('heading', { name: 'Editar presupuesto' })).toBeVisible();
}

test('1 · back/forward reabre el mismo presupuesto sin perder identidad ni datos persistidos', async ({ page }) => {
  await login(page);
  const marker = `E2E history ${Date.now()}`;
  const created = await createBudget(page, marker);
  await openEdit(page, created.budget.code);
  await expect(page).toHaveURL(new RegExp(`view=budget-edit.*budgetId=${created.budget.id}`));
  await expect(page.locator('#budget-desc')).toHaveValue(marker);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`view=budget-edit.*budgetId=${created.budget.id}`));
  await expect(page.getByRole('heading', { name: 'Editar presupuesto' })).toBeVisible();
  await expect(page.locator('#budget-desc')).toHaveValue(marker);
  await expect(page.locator('#svc-name-0')).toHaveValue('Material edit navigation E2E');
});

test('2 · refresh dentro de edición reconstruye el presupuesto desde persistencia', async ({ page }) => {
  await login(page);
  const marker = `E2E refresh edit ${Date.now()}`;
  const created = await createBudget(page, marker);
  await openEdit(page, created.budget.code);
  await expect(page).toHaveURL(new RegExp(`view=budget-edit.*budgetId=${created.budget.id}`));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Editar presupuesto' })).toBeVisible();
  await expect(page.locator('#budget-desc')).toHaveValue(marker);
  await expect(page.locator('#svc-price-0')).toHaveValue('13');
  await expect(page.locator('#svc-qty-0')).toHaveValue('2');
});

test('3 · doble clic en Actualizar no puede consumir dos veces la misma cotización', async ({ page }) => {
  await login(page);
  const marker = `E2E dbl update ${Date.now()}`;
  const created = await createBudget(page, marker);
  await openEdit(page, created.budget.code);
  await page.locator('#svc-price-0').fill('19');
  await page.locator('#svc-qty-0').fill('3');
  const calcResponsePromise = page.waitForResponse(r => r.url().includes('/api/calculations') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  expect((await calcResponsePromise).status()).toBe(200);

  const putStatuses: number[] = [];
  page.on('response', response => {
    if (response.url().endsWith('/api/budgets') && response.request().method() === 'PUT') putStatuses.push(response.status());
  });
  await page.getByRole('button', { name: 'Actualizar', exact: true }).dblclick({ force: true });
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  await page.waitForTimeout(400);
  expect(putStatuses.filter(s => s === 200)).toHaveLength(1);
  expect(putStatuses.every(s => s === 200 || s === 409)).toBe(true);
  const exact = await api<{ budgets: SavedBudget[] }>(page, `/api/budgets?id=${encodeURIComponent(created.budget.id)}`);
  expect(exact.status).toBe(200);
  expect(exact.body.budgets[0].description).toBe(marker);
});

test('4 · modificar un campo después de calcular invalida el resultado y bloquea guardado obsoleto', async ({ page }) => {
  await login(page);
  const marker = `E2E stale edit ${Date.now()}`;
  const created = await createBudget(page, marker);
  await openEdit(page, created.budget.code);
  await page.locator('#svc-price-0').fill('21');
  const calcResponsePromise = page.waitForResponse(r => r.url().includes('/api/calculations') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  expect((await calcResponsePromise).status()).toBe(200);
  await page.locator('#svc-qty-0').fill('4');
  await expect(page.getByText(/Recalcular necesario/i)).toBeVisible();
  let putSeen = false;
  page.on('request', request => { if (request.url().endsWith('/api/budgets') && request.method() === 'PUT') putSeen = true; });
  // The success toast from Calculate can visually overlap the footer for a moment;
  // force dispatches the click so this regression tests stale-result blocking rather than toast timing.
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click({ force: true });
  await page.waitForTimeout(300);
  expect(putSeen).toBe(false);
  const exact = await api<{ budgets: SavedBudget[] }>(page, `/api/budgets?id=${encodeURIComponent(created.budget.id)}`);
  expect(exact.status).toBe(200);
  expect(exact.body.budgets[0].totalFinal).toBe(created.budget.totalFinal);
});
