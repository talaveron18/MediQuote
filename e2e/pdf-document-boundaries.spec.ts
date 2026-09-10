import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD;
if (!maestroPassword) {
  throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
}

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = { totals: { calculationToken: string; totalFinal: number } };
type SavedPayload = { budget: { id: string; code: string; totalFinal: number } };

async function api<T = unknown>(
  page: Page,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
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

function materialBlock(serviceName: string, fixedPrice = 31) {
  return {
    blockType: 'material',
    serviceName,
    professionalCategory: 'e2e-category-nursing',
    dateMode: 'range',
    dateRangeStart: '2026-10-05',
    dateRangeEnd: '2026-10-05',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity: 2,
    pricePerHour: fixedPrice,
    fixedPrice,
    ivaPercent: 21,
  };
}

async function createBudget(page: Page, description: string, serviceName = 'Documento E2E') {
  const calculation = await api<Calculation>(page, '/api/calculations', {
    method: 'POST',
    body: { blocks: [materialBlock(serviceName)], discountPercent: 0, ivaPercent: 21 },
  });
  expect(calculation.status).toBe(200);

  const saved = await api<SavedPayload>(page, '/api/budgets', {
    method: 'POST',
    body: {
      clientId: 'e2e-client-001',
      calculationToken: calculation.body.totals.calculationToken,
      description,
      status: 'borrador',
    },
  });
  expect(saved.status).toBe(201);
  expect(saved.body.budget.totalFinal).toBe(calculation.body.totals.totalFinal);
  return saved.body.budget;
}

test('1 · documento cliente se entrega no-cache, inline y con protección MIME', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E PDF headers ${Date.now()}`);

  const response = await page.request.get(`/api/pdf?id=${encodeURIComponent(budget.id)}&mode=client`);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['cache-control']).toContain('private');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['content-type']).toContain('text/html');
  expect(response.headers()['content-disposition']).toContain('inline');
  expect(response.headers()['content-disposition']).toContain(budget.code);
});

test('2 · texto controlado por usuario queda escapado en el documento y no se convierte en script', async ({ page }) => {
  await login(page);
  const marker = `xss-${Date.now()}`;
  const script = `<script>window.${marker}=true</script>`;
  const image = '<img src=x onerror=alert(1)>';
  const payload = `${script}${image}`;
  const budget = await createBudget(page, payload, `<b>${marker}</b>`);

  const response = await page.request.get(`/api/pdf?id=${encodeURIComponent(budget.id)}&mode=client`);
  expect(response.status()).toBe(200);
  const html = await response.text();

  expect(html).not.toContain(script);
  expect(html).not.toContain(image);
  expect(html).not.toContain(`<b>${marker}</b>`);
  expect(html).toContain(`&lt;script&gt;window.${marker}=true&lt;/script&gt;`);
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).toContain(`&lt;b&gt;${marker}&lt;/b&gt;`);
});

test('3 · documento cliente y comercial mantienen fronteras distintas de contenido y acción', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E PDF modes ${Date.now()}`);

  const clientResponse = await page.request.get(`/api/pdf?id=${encodeURIComponent(budget.id)}&mode=client`);
  expect(clientResponse.status()).toBe(200);
  const clientHtml = await clientResponse.text();
  expect(clientHtml).toContain('Enviar al cliente para firma');
  expect(clientHtml).not.toContain('DOCUMENTO COMERCIAL — USO INTERNO');
  expect(clientHtml).not.toContain('Comisión estimada del comercial');
  expect(clientHtml).not.toContain('internalCostPerHour');
  expect(clientHtml).not.toContain('internalMargin');

  const commercialResponse = await page.request.get(`/api/pdf?id=${encodeURIComponent(budget.id)}&mode=commercial`);
  expect(commercialResponse.status()).toBe(200);
  const commercialHtml = await commercialResponse.text();
  expect(commercialHtml).toContain('DOCUMENTO COMERCIAL — USO INTERNO');
  expect(commercialHtml).toContain('Comisión estimada del comercial');
  expect(commercialHtml).not.toContain('Enviar al cliente para firma');
  expect(commercialHtml).not.toContain('internalCostPerHour');
  expect(commercialHtml).not.toContain('internalMargin');
});

test('4 · modos inválidos y presupuestos inexistentes fallan cerrados sin generar documento', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E PDF invalid ${Date.now()}`);

  const invalidMode = await page.request.get(`/api/pdf?id=${encodeURIComponent(budget.id)}&mode=interno-secreto`);
  expect(invalidMode.status()).toBe(400);
  expect(await invalidMode.json()).toEqual({ error: 'Modo de documento no válido' });
  expect(invalidMode.headers()['content-type']).toContain('application/json');

  const missing = await page.request.get('/api/pdf?id=budget-does-not-exist-e2e&mode=client');
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toEqual({ error: 'Presupuesto no encontrado' });
  expect(missing.headers()['content-type']).toContain('application/json');
});
