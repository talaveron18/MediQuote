import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';
const nursingCategory = 'e2e-category-nursing';

type ApiResult<T = unknown> = { status: number; ok: boolean; body: T; headers: Record<string, string> };

async function api<T = unknown>(page: Page, path: string, options: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<ApiResult<T>> {
  return page.evaluate(async ({ requestPath, method, requestBody }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    let body: unknown = text;
    if (text) {
      try { body = JSON.parse(text); } catch { /* HTML/text response */ }
    }
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { status: response.status, ok: response.ok, body, headers };
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

function materialBlock(name: string) {
  return {
    blockType: 'material', serviceName: name, professionalCategory: nursingCategory,
    dateMode: 'specific', specificDates: ['2026-10-25'], shiftType: 'morning', hoursPerDay: 8,
    unitType: 'unidad', quantity: 1, pricePerHour: 17, fixedPrice: 17, ivaPercent: 21,
  };
}

async function createBudget(page: Page) {
  const calculation = await api<{ totals: { calculationToken: string } }>(page, '/api/calculations', {
    method: 'POST', body: { blocks: [materialBlock('PDF boundary')], discountPercent: 0, ivaPercent: 21 },
  });
  expect(calculation.status).toBe(200);
  const created = await api<{ budget: { id: string } }>(page, '/api/budgets', {
    method: 'POST', body: {
      clientId: 'e2e-client-001', calculationToken: calculation.body.totals.calculationToken,
      description: 'E2E PDF security boundary', status: 'borrador',
    },
  });
  expect(created.status).toBe(201);
  return created.body.budget.id;
}

test('los controles visuales permiten añadir y quitar bloques sin borrar el bloque restante', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Nuevo Presupuesto' }).last().click();
  await expect(page.getByText('Bloque 1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Añadir bloque' }).click();
  await page.getByRole('button', { name: 'Material', exact: true }).click();
  await expect(page.getByText('Bloque 2', { exact: true })).toBeVisible();
  await expect(page.locator('input#svc-name-1')).toHaveValue('Material');

  await page.locator('input#svc-name-0').fill('Bloque que debe sobrevivir');
  const trashButtons = page.locator('button:has(svg.lucide-trash-2)');
  await expect(trashButtons).toHaveCount(2);
  await trashButtons.nth(1).click();

  await expect(page.getByText('Bloque 2', { exact: true })).toHaveCount(0);
  await expect(page.locator('input#svc-name-0')).toHaveValue('Bloque que debe sobrevivir');
  await expect(page.locator('button:has(svg.lucide-trash-2)')).toHaveCount(1);
});

test('el documento PDF/HTML exige autenticación antes de revelar siquiera la existencia del presupuesto', async ({ page }) => {
  await page.goto('/login');
  const response = await api(page, '/api/pdf?id=identificador-sintetico');
  expect(response.status).toBe(401);
  expect(response.headers['cache-control']).toContain('no-store');
});

test('el endpoint de documento rechaza modos no permitidos con presupuesto válido', async ({ page }) => {
  await login(page);
  const budgetId = await createBudget(page);
  const response = await api<{ error: string }>(page, `/api/pdf?id=${encodeURIComponent(budgetId)}&mode=interno-secreto`);
  expect(response.status).toBe(400);
  expect(response.body.error).toContain('Modo de documento no válido');
});

test('la recuperación pública no permite enumerar cuentas por respuesta, estado ni caché', async ({ page }) => {
  const malformed = await api<{ success: boolean; message: string }>(page, '/api/recovery/password/request', {
    method: 'POST', body: { email: '' },
  });
  const unknown = await api<{ success: boolean; message: string }>(page, '/api/recovery/password/request', {
    method: 'POST', body: { email: 'no-existe-e2e@example.invalid' },
  });
  const known = await api<{ success: boolean; message: string }>(page, '/api/recovery/password/request', {
    method: 'POST', body: { email: 'e2e.maestro@example.invalid' },
  });

  for (const response of [malformed, unknown, known]) {
    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(response.headers['cache-control']).toContain('no-store');
  }
  expect(unknown.body.message).toBe(malformed.body.message);
  expect(known.body.message).toBe(malformed.body.message);
});
