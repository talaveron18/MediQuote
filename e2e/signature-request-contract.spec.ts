import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

const adminPassword = (() => {
  const value = process.env.E2E_ADMIN_PASSWORD;
  if (!value) throw new Error('E2E_ADMIN_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

type ApiResult<T = unknown> = { status: number; body: T };

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
      try { body = JSON.parse(text); } catch { /* HTML */ }
    }
    return { status: response.status, body };
  }, { requestPath: path, method: options.method ?? 'GET', requestBody: options.body }) as Promise<ApiResult<T>>;
}

async function login(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.admin@example.invalid');
  await page.locator('input#password').fill(adminPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function seedBudget(label: string) {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'e2e.admin@example.invalid' } });
  return db.budget.create({
    data: {
      code: `E2E-SIGN-CONTRACT-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      clientId: 'e2e-client-001',
      createdById: admin.id,
      description: 'Contrato de entrada de firma',
      subtotal: 100,
      totalFinal: 121,
      ivaPercent: 21,
      ivaAmount: 21,
    },
  });
}

async function assertNoSignatureMutation(budgetId: string) {
  const budget = await db.budget.findUniqueOrThrow({ where: { id: budgetId } });
  const requests = await db.budgetSignatureRequest.findMany({ where: { budgetId } });
  const signatureHistory = await db.budgetHistory.count({ where: { budgetId, action: 'signature_requested' } });
  expect(budget.status).toBe('borrador');
  expect(requests).toHaveLength(0);
  expect(signatureHistory).toBe(0);
}

test.afterAll(async () => { await db.$disconnect(); });

test('POST firma rechaza campos superiores desconocidos sin mutar presupuesto', async ({ page }) => {
  const budget = await seedBudget('UNKNOWN-FIELD');
  await login(page);
  const response = await api<{ error: string }>(page, '/api/signatures', {
    method: 'POST',
    body: { budgetId: budget.id, recipientEmail: 'cliente@example.invalid', status: 'accepted' },
  });
  expect(response.status).toBe(400);
  expect(response.body.error).toContain('Campos no permitidos');
  await assertNoSignatureMutation(budget.id);
});

test('POST firma no convierte correo explícitamente vacío en fallback al correo del cliente', async ({ page }) => {
  const budget = await seedBudget('EMPTY-EMAIL');
  await login(page);
  const response = await api<{ error: string }>(page, '/api/signatures', {
    method: 'POST',
    body: { budgetId: budget.id, recipientEmail: '   ' },
  });
  expect(response.status).toBe(400);
  expect(response.body.error).toContain('no es válido');
  await assertNoSignatureMutation(budget.id);
});

test('GET firma rechaza selección ambigua certificate + budgetId antes de housekeeping', async ({ page }) => {
  const budget = await seedBudget('AMBIGUOUS-GET');
  await login(page);
  const response = await api<{ error: string }>(page, `/api/signatures?certificate=falso&budgetId=${encodeURIComponent(budget.id)}`);
  expect(response.status).toBe(400);
  expect(response.body.error).toContain('exactamente un');
  await assertNoSignatureMutation(budget.id);
});

test('GET firma rechaza selectores duplicados o vacíos de forma canónica', async ({ page }) => {
  const budget = await seedBudget('CANONICAL-GET');
  await login(page);

  const duplicated = await api<{ error: string }>(page, `/api/signatures?budgetId=${encodeURIComponent(budget.id)}&budgetId=${encodeURIComponent(budget.id)}`);
  expect(duplicated.status).toBe(400);
  expect(duplicated.body.error).toContain('exactamente un');

  const blank = await api<{ error: string }>(page, '/api/signatures?budgetId=%20%20');
  expect(blank.status).toBe(400);
  expect(blank.body.error).toContain('no puede estar vacío');

  await assertNoSignatureMutation(budget.id);
});
