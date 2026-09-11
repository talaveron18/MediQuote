import { expect, test, type Page } from '@playwright/test';

const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

type BrowserResponse = {
  status: number;
  headers: Record<string, string>;
  body: any;
};

async function login(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(maestroPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function browserFetch(
  page: Page,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {},
): Promise<BrowserResponse> {
  return page.evaluate(async ({ requestPath, method, requestBody }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    let body: any = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };
  }, { requestPath: path, method: options.method ?? 'GET', requestBody: options.body });
}

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toContain('private');
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.headers['pragma']).toBe('no-cache');
  expect(response.headers['expires']).toBe('0');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

function materialBlock(serviceName: string) {
  return {
    blockType: 'material',
    serviceName,
    professionalCategory: 'e2e-category-nursing',
    dateMode: 'range',
    dateRangeStart: '2026-10-06',
    dateRangeEnd: '2026-10-06',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity: 1,
    pricePerHour: 37,
    fixedPrice: 37,
    ivaPercent: 21,
  };
}

async function calculate(page: Page, serviceName: string) {
  const response = await browserFetch(page, '/api/calculations', {
    method: 'POST',
    body: { blocks: [materialBlock(serviceName)], discountPercent: 0, ivaPercent: 21 },
  });
  expect(response.status).toBe(200);
  return response.body.totals.calculationToken as string;
}

test('GET de presupuestos y errores de lookup nunca son cacheables', async ({ page }) => {
  await login(page);

  const list = await browserFetch(page, '/api/budgets');
  expect(list.status).toBe(200);
  expectPrivateNoStore(list);

  const missing = await browserFetch(page, '/api/budgets?id=budget-private-cache-does-not-exist');
  expect(missing.status).toBe(404);
  expect(missing.body).toEqual({ error: 'Presupuesto no encontrado' });
  expectPrivateNoStore(missing);
});

test('POST, PUT, DELETE y conflictos de presupuesto mantienen private/no-store', async ({ page }) => {
  await login(page);
  const marker = `Private cache E2E ${Date.now()}`;
  const token = await calculate(page, marker);

  const created = await browserFetch(page, '/api/budgets', {
    method: 'POST',
    body: {
      clientId: 'e2e-client-001',
      calculationToken: token,
      description: marker,
      status: 'borrador',
    },
  });
  expect(created.status).toBe(201);
  expectPrivateNoStore(created);
  const budgetId = created.body.budget.id as string;

  const reused = await browserFetch(page, '/api/budgets', {
    method: 'POST',
    body: {
      clientId: 'e2e-client-001',
      calculationToken: token,
      description: `${marker} duplicate`,
      status: 'borrador',
    },
  });
  expect(reused.status).toBe(409);
  expectPrivateNoStore(reused);

  const updated = await browserFetch(page, '/api/budgets', {
    method: 'PUT',
    body: { id: budgetId, description: `${marker} updated` },
  });
  expect(updated.status).toBe(200);
  expect(updated.body.budget.description).toBe(`${marker} updated`);
  expectPrivateNoStore(updated);

  const deleted = await browserFetch(page, `/api/budgets?id=${encodeURIComponent(budgetId)}`, { method: 'DELETE' });
  expect(deleted.status).toBe(200);
  expect(deleted.body.success).toBe(true);
  expectPrivateNoStore(deleted);
});
