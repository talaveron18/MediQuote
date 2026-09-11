import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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
    dateMode: 'range', dateRangeStart: '2026-12-10', dateRangeEnd: '2026-12-10', shiftType: 'morning', hoursPerDay: 8,
    unitType: 'unidad', quantity, pricePerHour: fixedPrice, fixedPrice, ivaPercent: 21,
  };
}

async function createAcceptedSource(page: Page, marker: string) {
  const blocks = [material(`${marker} bloque A`, 41, 2), material(`${marker} bloque B`, 17, 3)];
  const calculation = await api<Calculation>(page, '/api/calculations', 'POST', { blocks, discountPercent: 0, ivaPercent: 21 });
  expect(calculation.status).toBe(200);
  const saved = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: calculation.body.totals.calculationToken, description: marker, status: 'borrador',
  });
  expect(saved.status).toBe(201);
  const signature = await api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId: saved.body.budget.id, recipientEmail: 'accepted.navigation@example.invalid',
  });
  expect(signature.status).toBe(201);
  const token = new URL(signature.body.signingUrl).pathname.split('/').pop()!;
  const accepted = await api(page, '/api/public/signature', 'POST', {
    token, signerName: 'Cliente Navigation E2E', signerEmail: 'accepted.navigation@example.invalid', signatureData: validPng, consent: true,
  });
  expect(accepted.status).toBe(200);
  return saved.body.budget;
}

async function openDuplicate(page: Page, budget: SavedBudget, doubleClick = false) {
  await page.goto('/');
  const row = page.getByTestId(`budget-row-${budget.id}`);
  await expect(row).toBeVisible();
  const duplicate = row.getByTitle('Duplicar como borrador; requiere recalcular');
  if (doubleClick) await duplicate.dblclick(); else await duplicate.click();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
}

async function expectCopiedBlocks(page: Page, marker: string) {
  await expect(page.getByTestId('budget-block-position-1')).toContainText(`${marker} bloque A`);
  await expect(page.getByTestId('budget-block-position-2')).toContainText(`${marker} bloque B`);
  await expect(page.getByTestId('budget-block-position-3')).toHaveCount(0);
  await expect(page.getByText('Resumen del presupuesto')).toHaveCount(0);
}

test('1 · doble clic en Duplicar abre una sola copia en memoria y no persiste presupuestos', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate dblclick ${Date.now()}`;
  const budget = await createAcceptedSource(page, marker);
  const before = await db.budget.count({ where: { description: `${marker} (Copia)` } });
  await openDuplicate(page, budget, true);
  await expectCopiedBlocks(page, marker);
  expect(await db.budget.count({ where: { description: `${marker} (Copia)` } })).toBe(before);
});

test('2 · refresh conserva el borrador duplicado exacto y obliga a recalcular', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate refresh ${Date.now()}`;
  const budget = await createAcceptedSource(page, marker);
  await openDuplicate(page, budget);
  await expectCopiedBlocks(page, marker);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
  await expectCopiedBlocks(page, marker);
});

test('3 · back/forward restaura la copia sin añadir bloques ni cálculo antiguo', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate history ${Date.now()}`;
  const budget = await createAcceptedSource(page, marker);
  await openDuplicate(page, budget);
  await expectCopiedBlocks(page, marker);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
  await expectCopiedBlocks(page, marker);
});

test('4 · doble clic en Guardar tras recalcular crea como máximo un duplicado y no reutiliza la cotización', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate save dblclick ${Date.now()}`;
  const budget = await createAcceptedSource(page, marker);
  await openDuplicate(page, budget);
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.getByText('Resumen del presupuesto')).toBeVisible();
  const save = page.getByRole('button', { name: 'Guardar' });
  await save.dblclick();
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  const copies = await db.budget.findMany({ where: { description: `${marker} (Copia)` } });
  expect(copies).toHaveLength(1);
  expect(copies[0].status).toBe('borrador');
});
