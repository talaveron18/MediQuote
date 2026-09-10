import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';

async function login(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(maestroPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function openNewBudget(page: Page) {
  await login(page);
  await page.getByRole('button', { name: /Nuevo Presupuesto/i }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
  await expect(page.getByText('Bloque 1', { exact: false })).toBeVisible();
}

async function addBlock(page: Page, label: string) {
  await page.getByRole('button', { name: /Añadir bloque/i }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
}

test('UI permite añadir varios tipos de bloque y mantiene su orden visual', async ({ page }) => {
  await openNewBudget(page);
  await addBlock(page, 'Material');
  await addBlock(page, 'Servicio fijo');

  await expect(page.getByText('Bloque 1', { exact: false })).toBeVisible();
  await expect(page.getByText('Bloque 2', { exact: false })).toBeVisible();
  await expect(page.getByText('Bloque 3', { exact: false })).toBeVisible();
  await expect(page.locator('button.text-red-500')).toHaveCount(3);
});

test('UI elimina un bloque intermedio y renumera la colección sin dejar un bloque fantasma', async ({ page }) => {
  await openNewBudget(page);
  await addBlock(page, 'Material');
  await addBlock(page, 'Servicio fijo');
  await expect(page.locator('button.text-red-500')).toHaveCount(3);

  await page.locator('button.text-red-500').nth(1).click();

  await expect(page.locator('button.text-red-500')).toHaveCount(2);
  await expect(page.getByText('Bloque 1', { exact: false })).toBeVisible();
  await expect(page.getByText('Bloque 2', { exact: false })).toBeVisible();
  await expect(page.getByText('Bloque 3', { exact: false })).toHaveCount(0);
  await expect(page.locator('#svc-name-1')).toHaveValue('Servicio fijo');
});

test('colapsar y reabrir un bloque conserva las ediciones locales del usuario', async ({ page }) => {
  await openNewBudget(page);
  await page.locator('#svc-name-0').fill('Cobertura UCI sintética');
  await page.locator('#hours-per-day-0').fill('12');

  const firstCard = page.getByText('Bloque 1', { exact: false }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  const controls = firstCard.locator('button');
  await controls.first().click();
  await expect(page.locator('#svc-name-0')).toHaveCount(0);
  await controls.first().click();

  await expect(page.locator('#svc-name-0')).toHaveValue('Cobertura UCI sintética');
  await expect(page.locator('#hours-per-day-0')).toHaveValue('12');
});

test('recargar un presupuesto nuevo no guarda silenciosamente mutaciones no confirmadas', async ({ page }) => {
  await openNewBudget(page);
  await addBlock(page, 'Material');
  await page.locator('#svc-name-1').fill('Material temporal no guardado');
  await expect(page.locator('button.text-red-500')).toHaveCount(2);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
  await expect(page.locator('button.text-red-500')).toHaveCount(1);
  await expect(page.locator('#svc-name-0')).toHaveValue('');
  await expect(page.getByDisplayValue('Material temporal no guardado')).toHaveCount(0);
});
