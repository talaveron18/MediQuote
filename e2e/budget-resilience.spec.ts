import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';
const commercialPassword = process.env.E2E_COMMERCIAL_PASSWORD ?? 'E2E-Comercial-Only-2026!';
const nursingCategory = 'e2e-category-nursing';

type ApiResult<T = unknown> = { status: number; ok: boolean; body: T };

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
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { status: response.status, ok: response.ok, body };
  }, { requestPath: path, method: options.method ?? 'GET', requestBody: options.body }) as Promise<ApiResult<T>>;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email);
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

function block(name: string, date: string) {
  return {
    blockType: 'material', serviceName: name, professionalCategory: nursingCategory,
    dateMode: 'specific', specificDates: [date], shiftType: 'morning', hoursPerDay: 8,
    unitType: 'unidad', quantity: 1, pricePerHour: 17, fixedPrice: 17, ivaPercent: 21,
  };
}

async function calculate(page: Page, blocks: unknown[]) {
  const result = await api<{ totals: { calculationToken: string; totalFinal: number } }>(page, '/api/calculations', {
    method: 'POST', body: { blocks, discountPercent: 0, ivaPercent: 21 },
  });
  expect(result.status).toBe(200);
  return result.body;
}

async function createBudget(page: Page, marker: string, token: string) {
  const result = await api<{ budget: { id: string; code: string }; immutableArtifact: { version: number; artifactHash: string } }>(page, '/api/budgets', {
    method: 'POST', body: { clientId: 'e2e-client-001', calculationToken: token, description: marker, status: 'borrador' },
  });
  expect(result.status).toBe(201);
  return result.body;
}

test('bloques repetidos conservan identidad posicional y totales tras guardar y recargar', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const calc = await calculate(page, [block('Repetido A', '2026-10-12'), block('Repetido A', '2026-10-13'), block('Repetido A', '2026-10-14')]);
  const created = await createBudget(page, 'E2E bloques repetidos', calc.totals.calculationToken);
  await page.reload();
  const reopened = await api<{ budgets: Array<{ totalFinal: number; serviceBlocks: Array<{ serviceName: string; sortOrder: number }> }> }>(page, `/api/budgets?search=${encodeURIComponent(created.budget.code)}`);
  expect(reopened.status).toBe(200);
  expect(reopened.body.budgets[0].serviceBlocks.map((b) => b.sortOrder)).toEqual([0, 1, 2]);
  expect(reopened.body.budgets[0].serviceBlocks.map((b) => b.serviceName)).toEqual(['Repetido A', 'Repetido A', 'Repetido A']);
  expect(reopened.body.budgets[0].totalFinal).toBe(calc.totals.totalFinal);
});

test('quitar un bloque mediante edición crea nueva versión sin sobrescribir snapshot previo', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const first = await calculate(page, [block('Mantener', '2026-10-15'), block('Quitar', '2026-10-16')]);
  const created = await createBudget(page, 'E2E quitar bloque', first.totals.calculationToken);
  const second = await calculate(page, [block('Mantener', '2026-10-15')]);
  const edited = await api<{ immutableArtifact: { version: number; artifactHash: string }; budget: { serviceBlocks: unknown[] } }>(page, '/api/budgets', {
    method: 'PUT', body: { id: created.budget.id, calculationToken: second.totals.calculationToken, serviceBlocks: [], description: 'E2E quitar bloque v2' },
  });
  expect(edited.status).toBe(200);
  expect(edited.body.immutableArtifact.version).toBe(2);
  expect(edited.body.immutableArtifact.artifactHash).not.toBe(created.immutableArtifact.artifactHash);
  expect(edited.body.budget.serviceBlocks).toHaveLength(1);
});

test('reordenar bloques cambia la nueva versión pero conserva total económico cuando los importes son iguales', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const a = block('Orden A', '2026-10-17');
  const b = block('Orden B', '2026-10-18');
  const first = await calculate(page, [a, b]);
  const created = await createBudget(page, 'E2E reordenación', first.totals.calculationToken);
  const second = await calculate(page, [b, a]);
  expect(second.totals.totalFinal).toBe(first.totals.totalFinal);
  const edited = await api<{ immutableArtifact: { version: number; artifactHash: string }; budget: { serviceBlocks: Array<{ serviceName: string; sortOrder: number }>; totalFinal: number } }>(page, '/api/budgets', {
    method: 'PUT', body: { id: created.budget.id, calculationToken: second.totals.calculationToken, serviceBlocks: [], description: 'E2E reordenación v2' },
  });
  expect(edited.status).toBe(200);
  expect(edited.body.budget.serviceBlocks.map((x) => x.serviceName)).toEqual(['Orden B', 'Orden A']);
  expect(edited.body.budget.serviceBlocks.map((x) => x.sortOrder)).toEqual([0, 1]);
  expect(edited.body.budget.totalFinal).toBe(first.totals.totalFinal);
  expect(edited.body.immutableArtifact.artifactHash).not.toBe(created.immutableArtifact.artifactHash);
});

test('comercial no puede crear enlaces de firma para presupuestos ajenos al flujo permitido', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const calc = await calculate(page, [block('Firma restringida', '2026-10-19')]);
  const created = await createBudget(page, 'E2E permisos firma', calc.totals.calculationToken);
  await api(page, '/api/auth', { method: 'POST', body: { action: 'logout' } });
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);
  const signature = await api<{ error?: string }>(page, '/api/signatures', {
    method: 'POST', body: { budgetId: created.budget.id, recipientEmail: 'cliente-restringido@example.invalid' },
  });
  expect([403, 404]).toContain(signature.status);
});
