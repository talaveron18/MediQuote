import { expect, test, type Page } from '@playwright/test';

const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

const nursingCategory = 'e2e-category-nursing';

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = { totals: { calculationToken: string } };
type CreatedBudget = { budget: { id: string; code: string; status: string } };

async function api<T = unknown>(
  page: Page,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {},
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

function block(marker: string) {
  return {
    blockType: 'material',
    serviceName: marker,
    professionalCategory: nursingCategory,
    dateMode: 'range',
    dateRangeStart: '2026-10-19',
    dateRangeEnd: '2026-10-19',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity: 1,
    pricePerHour: 40,
    fixedPrice: 40,
    ivaPercent: 21,
  };
}

async function calculate(page: Page, marker: string) {
  const result = await api<Calculation>(page, '/api/calculations', {
    method: 'POST',
    body: { blocks: [block(marker)], discountPercent: 0, ivaPercent: 21 },
  });
  expect(result.status).toBe(200);
  expect(result.body.totals.calculationToken).toBeTruthy();
  return result.body.totals.calculationToken;
}

async function createDraft(page: Page, marker: string) {
  const token = await calculate(page, marker);
  const result = await api<CreatedBudget>(page, '/api/budgets', {
    method: 'POST',
    body: { clientId: 'e2e-client-001', calculationToken: token, description: marker, status: 'borrador' },
  });
  expect(result.status).toBe(201);
  expect(result.body.budget.status).toBe('borrador');
  return result.body.budget;
}

async function readBudget(page: Page, id: string) {
  const result = await api<{ budgets: Array<{ id: string; status: string }> }>(page, `/api/budgets?id=${encodeURIComponent(id)}`);
  expect(result.status).toBe(200);
  expect(result.body.budgets).toHaveLength(1);
  return result.body.budgets[0];
}

test('1 · alta directa no puede fabricar un presupuesto aceptado y no consume la cotización', async ({ page }) => {
  await login(page);
  const marker = `E2E estado inicial ${Date.now()}`;
  const token = await calculate(page, marker);

  const forged = await api(page, '/api/budgets', {
    method: 'POST',
    body: { clientId: 'e2e-client-001', calculationToken: token, description: marker, status: 'aceptado' },
  });
  expect(forged.status).toBe(400);

  const legitimate = await api<CreatedBudget>(page, '/api/budgets', {
    method: 'POST',
    body: { clientId: 'e2e-client-001', calculationToken: token, description: marker, status: 'borrador' },
  });
  expect(legitimate.status).toBe(201);
  expect(legitimate.body.budget.status).toBe('borrador');
});

test('2 · PUT no puede registrar aceptación sin pasar por la firma electrónica', async ({ page }) => {
  await login(page);
  const budget = await createDraft(page, `E2E aceptación autoritativa ${Date.now()}`);

  const forged = await api(page, '/api/budgets', {
    method: 'PUT',
    body: { id: budget.id, status: 'aceptado' },
  });
  expect(forged.status).toBe(409);
  expect((await readBudget(page, budget.id)).status).toBe('borrador');
});

test('3 · PUT no puede simular envío; solo la solicitud de firma mueve a enviado', async ({ page }) => {
  await login(page);
  const budget = await createDraft(page, `E2E envío autoritativo ${Date.now()}`);

  const forged = await api(page, '/api/budgets', {
    method: 'PUT',
    body: { id: budget.id, status: 'enviado' },
  });
  expect(forged.status).toBe(409);
  expect((await readBudget(page, budget.id)).status).toBe('borrador');

  const issued = await api(page, '/api/signatures', {
    method: 'POST',
    body: { budgetId: budget.id, recipientEmail: 'cliente.estado@example.invalid' },
  });
  expect(issued.status).toBe(201);
  expect((await readBudget(page, budget.id)).status).toBe('enviado');
});

test('4 · PUT no puede simular caducidad; solo el cierre controlado puede caducar', async ({ page }) => {
  await login(page);
  const budget = await createDraft(page, `E2E caducidad autoritativa ${Date.now()}`);

  const forged = await api(page, '/api/budgets', {
    method: 'PUT',
    body: { id: budget.id, status: 'caducado' },
  });
  expect(forged.status).toBe(409);
  expect((await readBudget(page, budget.id)).status).toBe('borrador');

  const closed = await api(page, `/api/budgets?id=${encodeURIComponent(budget.id)}`, { method: 'DELETE' });
  expect(closed.status).toBe(200);
  expect((await readBudget(page, budget.id)).status).toBe('caducado');
});
