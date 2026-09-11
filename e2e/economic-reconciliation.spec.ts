import { expect, test, type Page } from '@playwright/test';

const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = {
  totals: {
    subtotal: number;
    discountAmount: number;
    ivaAmount: number;
    totalFinal: number;
    calculationToken: string;
  } | null;
  commercial: {
    status: 'calculated' | 'pending_configuration';
    initialPriceExVat?: number;
    closingPriceExVat?: number;
    discountAmount?: number;
    discountPercent?: number;
    maximumDiscountPercent?: number;
    semaphore?: string;
    requiresAuthorization: boolean;
    pendingFields?: string[];
  };
  internalCost?: { totalInternalCost: number; directCostTotal: number; directCostOverhead: number; laborBlocks?: unknown[] };
  issues?: Array<{ field: string; kind: string; message: string }>;
};
type Saved = {
  budget: { id: string; code: string; totalFinal: number; description?: string | null };
  immutableArtifact: { version: number; artifactHash: string };
};
type CostSnapshot = {
  budget: { id: string; code: string; totalFinal: number };
  internalCost: { totalInternalCost: number; directCostTotal: number; directCostOverhead: number; laborBlocks?: unknown[] };
  commercial: {
    initialListPriceExVat: number;
    minimumOrdinaryPriceExVat: number;
    closingPriceExVat: number;
    clientDiscountAmount: number;
    clientDiscountPercentOfList: number;
    commissionTier: 'floor' | 'intermediate' | 'list';
    commissionRatePercent: number;
    commissionAmount: number;
    finalGasiBenefit: number;
    gasiReturnOnCostPercent: number;
    finalMarginOnSalePercent: number;
    semaphore: 'green' | 'yellow' | 'red';
  };
};

const formatCurrency = (value: number) => new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);

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

function directBlock(label: string, unitCost: number, quantity: number, ivaPercent = 21, sortOrder = 0) {
  return {
    blockType: 'material',
    serviceName: label,
    professionalCategory: '',
    dateMode: 'range',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity,
    pricePerHour: unitCost,
    fixedPrice: unitCost,
    ivaPercent,
    sortOrder,
  };
}

async function calculate(page: Page, blocks: unknown[], discountPercent = 0): Promise<Calculation> {
  const result = await api<Calculation>(page, '/api/calculations', {
    method: 'POST',
    body: { blocks, discountPercent, ivaPercent: 21 },
  });
  expect(result.status).toBe(200);
  return result.body;
}

async function save(page: Page, calculation: Calculation, marker: string): Promise<Saved> {
  expect(calculation.totals?.calculationToken).toBeTruthy();
  const result = await api<Saved>(page, '/api/budgets', {
    method: 'POST',
    body: {
      clientId: 'e2e-client-001',
      calculationToken: calculation.totals!.calculationToken,
      description: marker,
      status: 'borrador',
    },
  });
  expect(result.status).toBe(201);
  return result.body;
}

async function addMaterialAndRemoveInitial(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Nuevo Presupuesto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
  await page.getByRole('button', { name: /Añadir bloque/i }).click();
  await page.locator('button').filter({ hasText: 'Material' }).click();
  await page.locator('button.text-red-500').first().click();
  await expect(page.locator('#svc-name-0')).toHaveValue('Material');
}

test('1 · el TOTAL visible coincide exactamente con el servidor tras clonar, editar, reordenar y mezclar IVA', async ({ page }) => {
  await login(page);
  await addMaterialAndRemoveInitial(page);

  await page.locator('#svc-name-0').fill('Material reconciliación A');
  await page.locator('#svc-price-0').fill('13');
  await page.locator('#svc-qty-0').fill('2');
  await page.getByRole('button', { name: 'Clonar bloque 1' }).click();

  const secondCard = page.getByText('Bloque 2', { exact: false }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await secondCard.locator('button').first().click();
  await page.locator('#svc-name-1').fill('Material reconciliación B');
  await page.locator('#svc-price-1').fill('17');
  await page.locator('#svc-qty-1').fill('3');
  await page.locator('#block-iva-1').click();
  await page.getByRole('option', { name: 'Exento (0%)' }).click();
  await page.getByRole('button', { name: 'Subir bloque 2' }).click();

  const responsePromise = page.waitForResponse((response) => response.url().includes('/api/calculations') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const calculation = await response.json() as Calculation;
  expect(calculation.commercial.status).toBe('calculated');
  expect(calculation.totals).not.toBeNull();

  const summary = page.getByText('Resumen del presupuesto').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await expect(summary.getByText(formatCurrency(calculation.totals!.totalFinal), { exact: true })).toBeVisible();
  expect(calculation.internalCost?.directCostTotal).toBe(77);
  expect(calculation.internalCost?.totalInternalCost).toBe(82.58);
});

test('2 · la cotización sellada reconcilia coste, margen, comisión y semáforo con el fixture económico sintético', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page, [directBlock('Coste sintético 100', 100, 1)]);
  expect(calculation.commercial.status).toBe('calculated');
  expect(calculation.internalCost).toEqual(expect.objectContaining({
    totalInternalCost: 107.25,
    directCostTotal: 100,
    directCostOverhead: 7.25,
  }));
  expect(calculation.commercial.initialPriceExVat).toBe(156.59);
  expect(calculation.commercial.closingPriceExVat).toBe(156.59);
  expect(calculation.commercial.semaphore).toBe('green');

  const created = await save(page, calculation, `E2E economía sellada ${Date.now()}`);
  const costing = await api<CostSnapshot>(page, `/api/costing?budgetId=${created.budget.id}`);
  expect(costing.status).toBe(200);
  expect(costing.body.internalCost).toEqual(calculation.internalCost);
  expect(costing.body.commercial.commissionTier).toBe('list');
  expect(costing.body.commercial.commissionRatePercent).toBe(10);
  expect(costing.body.commercial.commissionAmount).toBe(4.93);
  expect(costing.body.commercial.finalGasiBenefit).toBe(44.41);
  expect(costing.body.commercial.gasiReturnOnCostPercent).toBeCloseTo(41.4079, 4);
  expect(costing.body.commercial.finalMarginOnSalePercent).toBeCloseTo(28.3607, 4);
  expect(costing.body.commercial.semaphore).toBe('green');
});

test('3 · descuento extremo se acota al suelo y una edición posterior genera una cotización económica nueva sin contaminar la anterior', async ({ page }) => {
  await login(page);
  const blocksV1 = [directBlock('Desviación v1', 80, 1)];
  const discounted = await calculate(page, blocksV1, 999);
  expect(discounted.commercial.status).toBe('calculated');
  expect(discounted.internalCost?.totalInternalCost).toBe(85.8);
  expect(discounted.commercial.maximumDiscountPercent).toBe(4.11);
  expect(discounted.commercial.closingPriceExVat).toBe(120.12);

  const created = await save(page, discounted, `E2E desviación económica ${Date.now()}`);
  const snapshotV1 = await api<CostSnapshot>(page, `/api/costing?budgetId=${created.budget.id}`);
  expect(snapshotV1.status).toBe(200);
  expect(snapshotV1.body.commercial.commissionTier).toBe('floor');
  expect(snapshotV1.body.commercial.commissionRatePercent).toBe(8);
  expect(snapshotV1.body.commercial.closingPriceExVat).toBe(120.12);

  const blocksV2 = [directBlock('Desviación v2', 120, 1)];
  const recalculated = await calculate(page, blocksV2, 0);
  expect(recalculated.totals).not.toBeNull();
  const updated = await api<Saved>(page, '/api/budgets', {
    method: 'PUT',
    body: {
      id: created.budget.id,
      calculationToken: recalculated.totals!.calculationToken,
      description: 'E2E desviación económica v2',
      serviceBlocks: [],
    },
  });
  expect(updated.status).toBe(200);
  expect(updated.body.immutableArtifact.version).toBe(2);

  const snapshotV2 = await api<CostSnapshot>(page, `/api/costing?budgetId=${created.budget.id}`);
  expect(snapshotV2.status).toBe(200);
  expect(snapshotV2.body.internalCost.totalInternalCost).toBe(128.7);
  expect(snapshotV2.body.commercial.commissionTier).toBe('list');
  expect(snapshotV2.body.commercial.commissionRatePercent).toBe(10);
  expect(snapshotV2.body.commercial.closingPriceExVat).toBe(187.9);
  expect(snapshotV2.body.commercial.closingPriceExVat).not.toBe(snapshotV1.body.commercial.closingPriceExVat);
});

test('4 · costes directos nulos o negativos fallan cerrados: no hay total ni token reutilizable ni cero silencioso', async ({ page }) => {
  await login(page);

  for (const [label, block] of [
    ['precio negativo', directBlock('Inválido negativo', -1, 1)],
    ['cantidad cero', directBlock('Inválido cero', 10, 0)],
  ] as const) {
    const calculation = await calculate(page, [block]);
    expect(calculation.commercial.status, label).toBe('pending_configuration');
    expect(calculation.commercial.requiresAuthorization, label).toBe(true);
    expect(calculation.totals, label).toBeNull();
    expect(calculation.issues?.some((issue) => issue.field === 'blocks.0.directCost'), label).toBe(true);
  }

  const invalidLocation = await api<Calculation>(page, '/api/calculations', {
    method: 'POST',
    body: {
      blocks: [directBlock('Ubicación inválida', 10, 1)],
      location: { cc: 'Territorio inexistente', province: 'Provincia inexistente', municipality: 'Centro inexistente' },
    },
  });
  expect(invalidLocation.status).toBe(400);
  expect((invalidLocation.body as unknown as { error: string }).error).toContain('zona territorial válida');
});
