import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';
const commercialPassword = process.env.E2E_COMMERCIAL_PASSWORD ?? 'E2E-Comercial-Only-2026!';

type ApiResult<T = unknown> = { status: number; body: T };
type SavedBudget = {
  id: string;
  code: string;
  description: string | null;
  status: string;
  totalFinal: number;
  createdById: string;
  serviceBlocks: Array<{ serviceName: string; sortOrder: number; fixedPrice?: number | null; quantity?: number }>;
};
type Calculation = { totals: { calculationToken: string; totalFinal: number } };
type SavedPayload = { budget: SavedBudget; immutableArtifact: { version: number; artifactHash: string } };

async function api<T = unknown>(page: Page, path: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}): Promise<ApiResult<T>> {
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

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email);
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible({ timeout: 15_000 });
  const remoteConfigDialog = page.getByRole('dialog', { name: 'Configuración remota disponible' });
  if (await remoteConfigDialog.isVisible().catch(() => false)) {
    await remoteConfigDialog.getByRole('button', { name: 'Ahora no' }).click();
  }
}

async function logout(page: Page) {
  const result = await api(page, '/api/auth?action=logout', { method: 'POST' });
  expect(result.status).toBe(200);
}

function materialBlock(price = 13, quantity = 2) {
  return {
    blockType: 'material',
    serviceName: 'Material ownership E2E',
    professionalCategory: 'e2e-category-nursing',
    dateMode: 'range',
    dateRangeStart: '2026-10-05',
    dateRangeEnd: '2026-10-05',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity,
    pricePerHour: price,
    fixedPrice: price,
    ivaPercent: 21,
  };
}

async function calculate(page: Page, price = 13, quantity = 2) {
  const result = await api<Calculation>(page, '/api/calculations', {
    method: 'POST',
    body: { blocks: [materialBlock(price, quantity)], discountPercent: 0, ivaPercent: 21 },
  });
  expect(result.status).toBe(200);
  expect(result.body.totals.calculationToken).toBeTruthy();
  return result.body;
}

async function createBudget(page: Page, marker: string, price = 13, quantity = 2) {
  const calculation = await calculate(page, price, quantity);
  const result = await api<SavedPayload>(page, '/api/budgets', {
    method: 'POST',
    body: {
      clientId: 'e2e-client-001',
      calculationToken: calculation.totals.calculationToken,
      description: marker,
      status: 'borrador',
    },
  });
  expect(result.status).toBe(201);
  expect(result.body.immutableArtifact.version).toBe(1);
  return { ...result.body, calculation };
}

async function getById(page: Page, id: string) {
  return api<{ budgets: SavedBudget[] }>(page, `/api/budgets?id=${encodeURIComponent(id)}`);
}

async function createMaestroBudgetThenLoginCommercial(page: Page, marker: string) {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const created = await createBudget(page, marker);
  await logout(page);
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);
  return created;
}

test('1 · comercial no puede enumerar ni abrir por ID presupuestos creados por otro usuario', async ({ page }) => {
  const marker = `E2E ownership read ${Date.now()}`;
  const created = await createMaestroBudgetThenLoginCommercial(page, marker);

  const all = await api<{ budgets: SavedBudget[] }>(page, '/api/budgets');
  expect(all.status).toBe(200);
  expect(all.body.budgets.some((budget) => budget.id === created.budget.id)).toBe(false);

  const searched = await api<{ budgets: SavedBudget[] }>(page, `/api/budgets?search=${encodeURIComponent(marker)}`);
  expect(searched.status).toBe(200);
  expect(searched.body.budgets).toHaveLength(0);

  const exact = await getById(page, created.budget.id);
  expect(exact.status).toBe(404);
});

test('2 · comercial no puede modificar por ID un presupuesto ajeno', async ({ page }) => {
  const marker = `E2E ownership update ${Date.now()}`;
  const created = await createMaestroBudgetThenLoginCommercial(page, marker);

  const denied = await api<{ error: string }>(page, '/api/budgets', {
    method: 'PUT',
    body: { id: created.budget.id, description: 'ALTERADO POR TERCERO' },
  });
  expect(denied.status).toBe(404);
  expect(denied.body.error).toBe('Presupuesto no encontrado');

  await logout(page);
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const intact = await getById(page, created.budget.id);
  expect(intact.status).toBe(200);
  expect(intact.body.budgets[0].description).toBe(marker);
});

test('3 · comercial no puede caducar/eliminar por ID un presupuesto ajeno', async ({ page }) => {
  const marker = `E2E ownership delete ${Date.now()}`;
  const created = await createMaestroBudgetThenLoginCommercial(page, marker);

  const denied = await api<{ error: string }>(page, `/api/budgets?id=${encodeURIComponent(created.budget.id)}`, { method: 'DELETE' });
  expect(denied.status).toBe(404);
  expect(denied.body.error).toBe('Presupuesto no encontrado');

  await logout(page);
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const intact = await getById(page, created.budget.id);
  expect(intact.status).toBe(200);
  expect(intact.body.budgets[0].status).toBe('borrador');
});

test('4 · dashboard → editar → recalcular → guardar crea v2 y persiste tras reabrir y recargar', async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const marker = `E2E UI edit ${Date.now()}`;
  const created = await createBudget(page, marker, 13, 2);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  const search = page.getByPlaceholder('Buscar por código, descripción o cliente...');
  await search.fill(created.budget.code);
  await search.press('Enter');
  const row = page.getByRole('row').filter({ hasText: created.budget.code });
  await expect(row).toHaveCount(1);
  await row.getByTitle('Editar').click();

  await expect(page.getByRole('heading', { name: 'Editar presupuesto' })).toBeVisible();
  await expect(page.locator('#budget-desc')).toHaveValue(marker);
  await expect(page.locator('#svc-name-0')).toHaveValue('Material ownership E2E');
  await expect(page.locator('#svc-price-0')).toHaveValue('13');
  await expect(page.locator('#svc-qty-0')).toHaveValue('2');

  const editedMarker = `${marker} v2`;
  await page.locator('#budget-desc').fill(editedMarker);
  await page.locator('#svc-price-0').fill('17');
  await page.locator('#svc-qty-0').fill('3');

  const calculationPromise = page.waitForResponse((response) => response.url().includes('/api/calculations') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  const calculationResponse = await calculationPromise;
  expect(calculationResponse.status()).toBe(200);
  const editedCalculation = await calculationResponse.json() as Calculation;

  const savePromise = page.waitForResponse((response) => response.url().endsWith('/api/budgets') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  const saveResponse = await savePromise;
  expect(saveResponse.status()).toBe(200);
  const saved = await saveResponse.json() as SavedPayload;
  expect(saved.immutableArtifact.version).toBe(2);
  expect(saved.immutableArtifact.artifactHash).toMatch(/^[a-f0-9]{64}$/);
  expect(saved.immutableArtifact.artifactHash).not.toBe(created.immutableArtifact.artifactHash);
  expect(saved.budget.totalFinal).toBe(editedCalculation.totals.totalFinal);

  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  const searchAgain = page.getByPlaceholder('Buscar por código, descripción o cliente...');
  await searchAgain.fill(created.budget.code);
  await searchAgain.press('Enter');
  const reopenedRow = page.getByRole('row').filter({ hasText: created.budget.code });
  await expect(reopenedRow).toHaveCount(1);
  await reopenedRow.getByTitle('Editar').click();

  await expect(page.getByRole('heading', { name: 'Editar presupuesto' })).toBeVisible();
  await expect(page.locator('#budget-desc')).toHaveValue(editedMarker);
  await expect(page.locator('#svc-price-0')).toHaveValue('17');
  await expect(page.locator('#svc-qty-0')).toHaveValue('3');

  const exact = await getById(page, created.budget.id);
  expect(exact.status).toBe(200);
  expect(exact.body.budgets[0].description).toBe(editedMarker);
  expect(exact.body.budgets[0].totalFinal).toBe(editedCalculation.totals.totalFinal);
});
