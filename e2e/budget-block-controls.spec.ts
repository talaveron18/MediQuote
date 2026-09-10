import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';

async function openNewBudget(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(maestroPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('main').getByRole('button', { name: 'Nuevo Presupuesto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
  await expect(page.getByTestId('budget-block-controls')).toBeVisible();
}

async function addMaterial(page: Page) {
  await page.getByRole('button', { name: /Añadir bloque/i }).click();
  const option = page.locator('button').filter({ hasText: 'Material' });
  await expect(option).toHaveCount(1);
  await option.click();
}

test('clonar desde el control visual crea un bloque independiente y exige recalcular', async ({ page }) => {
  await openNewBudget(page);
  await page.locator('#svc-name-0').fill('Cobertura original E2E');

  const controls = page.getByTestId('budget-block-controls');
  await expect(controls).toHaveAttribute('data-calculation-state', 'stale');
  await page.getByRole('button', { name: 'Clonar bloque 1' }).click();

  await expect(page.getByRole('button', { name: 'Clonar bloque 2' })).toBeVisible();
  await expect(page.locator('#svc-name-0')).toHaveValue('Cobertura original E2E');
  await expect(page.locator('#svc-name-1')).toHaveValue('Cobertura original E2E');

  await page.locator('#svc-name-1').fill('Cobertura clonada E2E');
  await expect(page.locator('#svc-name-0')).toHaveValue('Cobertura original E2E');
  await expect(page.locator('#svc-name-1')).toHaveValue('Cobertura clonada E2E');
  await expect(controls).toHaveAttribute('data-calculation-state', 'stale');
});

test('subir y bajar desde el control visual reordena datos y protege los límites', async ({ page }) => {
  await openNewBudget(page);
  await page.locator('#svc-name-0').fill('Primero E2E');
  await addMaterial(page);
  await page.locator('#svc-name-1').fill('Segundo E2E');

  await expect(page.getByRole('button', { name: 'Subir bloque 1' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Bajar bloque 2' })).toBeDisabled();

  await page.getByRole('button', { name: 'Bajar bloque 1' }).click();
  await expect(page.locator('#svc-name-0')).toHaveValue('Segundo E2E');
  await expect(page.locator('#svc-name-1')).toHaveValue('Primero E2E');

  await page.getByRole('button', { name: 'Subir bloque 2' }).click();
  await expect(page.locator('#svc-name-0')).toHaveValue('Primero E2E');
  await expect(page.locator('#svc-name-1')).toHaveValue('Segundo E2E');
  await expect(page.getByTestId('budget-block-controls')).toHaveAttribute('data-calculation-state', 'stale');
});
