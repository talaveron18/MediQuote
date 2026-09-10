import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';

type SavedBudget = {
  id: string;
  code: string;
  description: string | null;
  totalFinal: number;
  serviceBlocks: Array<{ serviceName: string; sortOrder: number; blockTotalFinal: number }>;
};

type CalculationResponse = {
  totals: { totalFinal: number; calculationToken: string };
};

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
  await page.getByRole('navigation').getByRole('button', { name: 'Nuevo Presupuesto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
  await expect(page.locator('#svc-name-0')).toBeVisible();
}

async function addBlock(page: Page, label: string) {
  await page.getByRole('button', { name: /Añadir bloque/i }).click();
  const option = page.locator('button').filter({ hasText: label });
  await expect(option).toHaveCount(1);
  await option.click();
}

async function prepareMaterialBudget(page: Page) {
  await openNewBudget(page);
  await addBlock(page, 'Material');
  await page.locator('button.text-red-500').first().click();
  await expect(page.locator('#svc-name-0')).toHaveValue('Material');
  await page.locator('#svc-name-0').fill('Material sintético A');
  await page.locator('#svc-price-0').fill('13');
  await page.locator('#svc-qty-0').fill('2');
  await expect(page.getByTestId('budget-block-controls')).toBeVisible();
}

async function selectSyntheticClient(page: Page) {
  await page.locator('#client-select').click();
  await page.getByRole('option', { name: 'E2E Cliente Sintético' }).click();
}

async function reopenBySearch(page: Page, search: string): Promise<SavedBudget> {
  return page.evaluate(async (term) => {
    const response = await fetch(`/api/budgets?search=${encodeURIComponent(term)}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`reopen failed: ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.budgets) || body.budgets.length !== 1) throw new Error(`expected one budget, got ${body.budgets?.length ?? 'none'}`);
    return body.budgets[0];
  }, search);
}

test('1 · clonar desde controles visuales crea una copia editable e independiente', async ({ page }) => {
  await prepareMaterialBudget(page);

  await page.getByRole('button', { name: 'Clonar bloque 1' }).click();
  await expect(page.getByTestId('budget-block-controls')).toHaveAttribute('data-calculation-state', 'stale');
  await expect(page.getByTestId('budget-block-position-1')).toContainText('Material sintético A');
  await expect(page.getByTestId('budget-block-position-2')).toContainText('Material sintético A');

  // El clon se crea colapsado porque es una ficha nueva; abrirla y editarla no debe tocar el original.
  const secondCard = page.getByText('Bloque 2', { exact: false }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await secondCard.locator('button').first().click();
  await expect(page.locator('#svc-name-1')).toHaveValue('Material sintético A');
  await page.locator('#svc-name-1').fill('Material sintético B');
  await page.locator('#svc-price-1').fill('17');

  await expect(page.locator('#svc-name-0')).toHaveValue('Material sintético A');
  await expect(page.locator('#svc-price-0')).toHaveValue('13');
  await expect(page.locator('#svc-name-1')).toHaveValue('Material sintético B');
  await expect(page.locator('#svc-price-1')).toHaveValue('17');
});

test('2 · subir y bajar desde UI reordena fichas y respeta los límites', async ({ page }) => {
  await prepareMaterialBudget(page);
  await page.getByRole('button', { name: 'Clonar bloque 1' }).click();
  const secondCard = page.getByText('Bloque 2', { exact: false }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await secondCard.locator('button').first().click();
  await page.locator('#svc-name-1').fill('Material sintético B');

  await expect(page.getByRole('button', { name: 'Subir bloque 1' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Bajar bloque 2' })).toBeDisabled();

  await page.getByRole('button', { name: 'Subir bloque 2' }).click();
  await expect(page.locator('#svc-name-0')).toHaveValue('Material sintético B');
  await expect(page.locator('#svc-name-1')).toHaveValue('Material sintético A');
  await expect(page.getByTestId('budget-block-position-1')).toContainText('Material sintético B');

  await page.getByRole('button', { name: 'Bajar bloque 1' }).click();
  await expect(page.locator('#svc-name-0')).toHaveValue('Material sintético A');
  await expect(page.locator('#svc-name-1')).toHaveValue('Material sintético B');
});

test('3 · mutar visualmente tras calcular invalida la cotización y bloquea un guardado obsoleto', async ({ page }) => {
  await prepareMaterialBudget(page);
  await selectSyntheticClient(page);
  await page.locator('#budget-desc').fill('E2E stale visual guard');

  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  await expect(page.getByTestId('budget-block-controls')).toHaveAttribute('data-calculation-state', 'calculated');

  await page.getByRole('button', { name: 'Clonar bloque 1' }).click();
  await expect(page.getByTestId('budget-block-controls')).toHaveAttribute('data-calculation-state', 'stale');
  await expect(page.getByText('Recalcular necesario', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Guardar/i }).click();
  await expect(page.getByText('Calcula el presupuesto antes de guardarlo', { exact: true })).toBeVisible();

  const matches = await page.evaluate(async () => {
    const response = await fetch('/api/budgets?search=E2E%20stale%20visual%20guard', { credentials: 'same-origin' });
    const body = await response.json();
    return body.budgets?.length ?? 0;
  });
  expect(matches).toBe(0);
});

test('4 · clone/reorder visual → recalcular → guardar → reabrir → recargar conserva orden y total servidor', async ({ page }) => {
  await prepareMaterialBudget(page);
  await selectSyntheticClient(page);
  const marker = 'E2E visual clone reorder persisted';
  await page.locator('#budget-desc').fill(marker);

  await page.getByRole('button', { name: 'Clonar bloque 1' }).click();
  const secondCard = page.getByText('Bloque 2', { exact: false }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await secondCard.locator('button').first().click();
  await page.locator('#svc-name-1').fill('Material sintético B');
  await page.locator('#svc-price-1').fill('17');
  await page.locator('#svc-qty-1').fill('3');
  await page.getByRole('button', { name: 'Subir bloque 2' }).click();
  await expect(page.locator('#svc-name-0')).toHaveValue('Material sintético B');

  const calculationPromise = page.waitForResponse((response) => response.url().includes('/api/calculations') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  const calculationResponse = await calculationPromise;
  expect(calculationResponse.status()).toBe(200);
  const calculation = await calculationResponse.json() as CalculationResponse;
  expect(calculation.totals.calculationToken).toBeTruthy();
  await expect(page.getByTestId('budget-block-controls')).toHaveAttribute('data-calculation-state', 'calculated');

  const savePromise = page.waitForResponse((response) => response.url().endsWith('/api/budgets') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Guardar/i }).click();
  const saveResponse = await savePromise;
  expect(saveResponse.status()).toBe(201);
  const savedPayload = await saveResponse.json() as { budget: SavedBudget; immutableArtifact: { version: number; artifactHash: string } };
  expect(savedPayload.immutableArtifact.version).toBe(1);
  expect(savedPayload.immutableArtifact.artifactHash).toMatch(/^[a-f0-9]{64}$/);
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();

  const reopened = await reopenBySearch(page, savedPayload.budget.code);
  expect(reopened.serviceBlocks.map((block) => block.serviceName)).toEqual(['Material sintético B', 'Material sintético A']);
  expect(reopened.serviceBlocks.map((block) => block.sortOrder)).toEqual([0, 1]);
  expect(reopened.totalFinal).toBe(calculation.totals.totalFinal);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  const afterReload = await reopenBySearch(page, savedPayload.budget.code);
  expect(afterReload.serviceBlocks.map((block) => block.serviceName)).toEqual(['Material sintético B', 'Material sintético A']);
  expect(afterReload.totalFinal).toBe(calculation.totals.totalFinal);
});
