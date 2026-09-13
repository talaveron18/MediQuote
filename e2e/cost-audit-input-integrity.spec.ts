import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';

function requiredEnv(name: 'E2E_ADMIN_PASSWORD'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const adminPassword = requiredEnv('E2E_ADMIN_PASSWORD');
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.admin@example.invalid');
  await page.locator('input#password').fill(adminPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function post(page: import('@playwright/test').Page, body: unknown) {
  return page.evaluate(async (payload) => {
    const response = await fetch('/api/cost-audits', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return {
      status: response.status,
      text: await response.text(),
      cacheControl: response.headers.get('cache-control'),
    };
  }, body);
}

async function expectRejectedWithoutMutation(
  page: import('@playwright/test').Page,
  body: unknown,
  expectedFragment: string,
) {
  const before = await db.costAudit.count();
  const response = await post(page, body);
  expect(response.status).toBe(400);
  expect(response.cacheControl).toBe('private, no-store');
  expect(response.text).toContain(expectedFragment);
  expect(await db.costAudit.count()).toBe(before);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.afterAll(async () => {
  await db.$disconnect();
});

test('rechaza campos superiores desconocidos antes de crear una auditoría', async ({ page }) => {
  await expectRejectedWithoutMutation(page, {
    budgetId: 'does-not-matter',
    actualCost: 100,
    marginOverride: 999,
  }, 'Campo de auditoría no reconocido: marginOverride');
});

test('actualCost exige un número JSON real y no admite coerción', async ({ page }) => {
  for (const invalid of ['100', [], [100], false]) {
    await expectRejectedWithoutMutation(page, {
      budgetId: 'does-not-matter',
      actualCost: invalid,
    }, 'coste real válido de gestoría');
  }
});

test('actualBreakdown exige importes JSON numéricos y no admite coerción', async ({ page }) => {
  for (const invalid of ['60', false, [], [60]]) {
    await expectRejectedWithoutMutation(page, {
      budgetId: 'does-not-matter',
      actualCost: 100,
      actualBreakdown: { salary: invalid },
    }, 'importe numérico no negativo');
  }
});

test('rechaza metadatos de justificante sin archivo adjunto', async ({ page }) => {
  await expectRejectedWithoutMutation(page, {
    budgetId: 'does-not-matter',
    actualCost: 100,
    documentName: 'gestoria.pdf',
    documentType: 'application/pdf',
  }, 'metadatos del justificante requieren un archivo adjunto');
});
