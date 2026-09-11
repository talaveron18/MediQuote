import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const DUPLICATE_DRAFT_KEY = 'mediquote:duplicate-draft:v1';

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = { totals: { calculationToken: string } };
type SavedBudget = { id: string; code: string; status: string; description: string | null };
type SavedPayload = { budget: SavedBudget };
type SignatureRequest = { signingUrl: string };

async function api<T = unknown>(page: Page, path: string, method = 'GET', body?: unknown): Promise<ApiResult<T>> {
  return page.evaluate(async ({ requestPath, requestMethod, requestBody }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      credentials: 'same-origin',
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
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error('E2E_ADMIN_PASSWORD is required');
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.admin@example.invalid');
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

function material(name: string, fixedPrice: number, quantity: number) {
  return {
    blockType: 'material', serviceName: name, materialName: `${name} detalle`, professionalCategory: 'e2e-category-nursing',
    dateMode: 'range', dateRangeStart: '2026-12-15', dateRangeEnd: '2026-12-15', shiftType: 'morning', hoursPerDay: 8,
    unitType: 'unidad', quantity, pricePerHour: fixedPrice, fixedPrice, ivaPercent: 21,
  };
}

async function createAcceptedSource(page: Page, marker: string) {
  const blocks = [material(`${marker} bloque A`, 43, 2), material(`${marker} bloque B`, 19, 3)];
  const calculation = await api<Calculation>(page, '/api/calculations', 'POST', { blocks, discountPercent: 0, ivaPercent: 21 });
  expect(calculation.status).toBe(200);
  const saved = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: calculation.body.totals.calculationToken, description: marker, status: 'borrador',
  });
  expect(saved.status).toBe(201);
  const signature = await api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId: saved.body.budget.id, recipientEmail: 'accepted.postsave@example.invalid',
  });
  expect(signature.status).toBe(201);
  const token = new URL(signature.body.signingUrl).pathname.split('/').pop()!;
  const accepted = await api(page, '/api/public/signature', 'POST', {
    token, signerName: 'Cliente PostSave E2E', signerEmail: 'accepted.postsave@example.invalid', signatureData: validPng, consent: true,
  });
  expect(accepted.status).toBe(200);
  return saved.body.budget;
}

async function openDuplicate(page: Page, budget: SavedBudget) {
  await page.goto('/');
  const row = page.getByTestId(`budget-row-${budget.id}`);
  await expect(row).toBeVisible();
  await row.getByTitle('Duplicar como borrador; requiere recalcular').click();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
}

async function saveDuplicate(page: Page, marker: string) {
  const calculationResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/calculations') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calcular' }).click();
  const calculationResponse = await calculationResponsePromise;
  expect(calculationResponse.status()).toBe(200);
  const calculation = await calculationResponse.json() as Calculation;
  await expect(page.getByText('Resumen del presupuesto')).toBeVisible();

  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();

  const copies = await db.budget.findMany({ where: { description: `${marker} (Copia)` }, orderBy: { createdAt: 'asc' } });
  expect(copies).toHaveLength(1);
  return { copyId: copies[0].id, calculationToken: calculation.totals.calculationToken };
}

async function expectFreshNewBudget(page: Page, marker: string) {
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
  await expect(page.getByText(`${marker} bloque A`)).toHaveCount(0);
  await expect(page.getByText(`${marker} bloque B`)).toHaveCount(0);
  await expect(page.getByText('Resumen del presupuesto')).toHaveCount(0);
}

test('1 · guardar un duplicado elimina el session draft temporal en la frontera de persistencia', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate post-save storage ${Date.now()}`;
  const source = await createAcceptedSource(page, marker);
  await openDuplicate(page, source);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DUPLICATE_DRAFT_KEY)).not.toBeNull();

  await saveDuplicate(page, marker);

  expect(await page.evaluate((key) => sessionStorage.getItem(key), DUPLICATE_DRAFT_KEY)).toBeNull();
  expect(await db.budget.count({ where: { description: `${marker} (Copia)` } })).toBe(1);
});

test('2 · Back tras guardar no resucita el duplicado persistido ni su cálculo', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate post-save back ${Date.now()}`;
  const source = await createAcceptedSource(page, marker);
  await openDuplicate(page, source);
  await saveDuplicate(page, marker);

  await page.goBack();
  await expectFreshNewBudget(page, marker);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DUPLICATE_DRAFT_KEY)).toBeNull();
  expect(await db.budget.count({ where: { description: `${marker} (Copia)` } })).toBe(1);
});

test('3 · Back/Forward/reload después de guardar permanece estable y no crea una segunda copia', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate post-save history ${Date.now()}`;
  const source = await createAcceptedSource(page, marker);
  await openDuplicate(page, source);
  await saveDuplicate(page, marker);

  await page.goBack();
  await expectFreshNewBudget(page, marker);
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  await page.goBack();
  await expectFreshNewBudget(page, marker);

  expect(await page.evaluate((key) => sessionStorage.getItem(key), DUPLICATE_DRAFT_KEY)).toBeNull();
  expect(await db.budget.count({ where: { description: `${marker} (Copia)` } })).toBe(1);
});

test('4 · el calculationToken consumido por el duplicado no puede reutilizarse tras guardar o navegar', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate post-save token ${Date.now()}`;
  const source = await createAcceptedSource(page, marker);
  await openDuplicate(page, source);
  const { calculationToken } = await saveDuplicate(page, marker);

  await page.goBack();
  await expectFreshNewBudget(page, marker);
  const replay = await api(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken, description: `${marker} (Copia)`, status: 'borrador',
  });
  expect(replay.status).toBe(409);
  expect(await db.budget.count({ where: { description: `${marker} (Copia)` } })).toBe(1);
});
