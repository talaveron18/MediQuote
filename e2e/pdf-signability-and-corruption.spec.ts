import { expect, test, type Page } from '@playwright/test';
import { db } from '../src/lib/db';

const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

const validSignatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = { status: number; body: T; headers: Record<string, string> };
type Calculation = { totals: { calculationToken: string } };
type Saved = { budget: { id: string; code: string } };
type SignatureCreated = { signingUrl: string };

async function api<T = unknown>(
  page: Page,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<ApiResult<T>> {
  return page.evaluate(async ({ requestPath, method, requestBody }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { status: response.status, body, headers: Object.fromEntries(response.headers.entries()) };
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

function block(serviceName: string) {
  return {
    blockType: 'material',
    serviceName,
    professionalCategory: 'e2e-category-nursing',
    dateMode: 'range',
    dateRangeStart: '2026-10-25',
    dateRangeEnd: '2026-10-25',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity: 1,
    pricePerHour: 37,
    fixedPrice: 37,
    ivaPercent: 21,
  };
}

async function createBudget(page: Page, marker: string) {
  const calculation = await api<Calculation>(page, '/api/calculations', {
    method: 'POST',
    body: { blocks: [block(marker)], discountPercent: 0, ivaPercent: 21 },
  });
  expect(calculation.status).toBe(200);

  const saved = await api<Saved>(page, '/api/budgets', {
    method: 'POST',
    body: {
      clientId: 'e2e-client-001',
      calculationToken: calculation.body.totals.calculationToken,
      description: marker,
      status: 'borrador',
    },
  });
  expect(saved.status).toBe(201);
  return saved.body.budget;
}

function expectPrivateNoStore(response: ApiResult) {
  expect(response.headers['cache-control']).toContain('private');
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.headers['pragma']).toBe('no-cache');
}

test('1 · un presupuesto aceptado no ofrece una acción de firma que la API rechazaría', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E PDF accepted signability ${Date.now()}`);
  const recipientEmail = 'pdf.accepted@example.invalid';

  const signature = await api<SignatureCreated>(page, '/api/signatures', {
    method: 'POST', body: { budgetId: budget.id, recipientEmail },
  });
  expect(signature.status).toBe(201);
  const token = new URL(signature.body.signingUrl).pathname.split('/').filter(Boolean).pop();
  expect(token).toBeTruthy();

  const accepted = await api<{ status: string }>(page, '/api/public/signature', {
    method: 'POST',
    body: {
      token,
      signerEmail: recipientEmail,
      signerName: 'Cliente PDF E2E',
      signatureData: validSignatureData,
      consent: true,
    },
  });
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');

  const document = await api<string>(page, `/api/pdf?id=${encodeURIComponent(budget.id)}&mode=client`);
  expect(document.status).toBe(200);
  expect(String(document.body)).not.toContain('Enviar al cliente para firma');
  expect(String(document.body)).not.toContain('sendBudgetForSignature');
});

test('2 · el botón de firma de un borrador pasa el evento de forma explícita', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E PDF explicit event ${Date.now()}`);

  const document = await api<string>(page, `/api/pdf?id=${encodeURIComponent(budget.id)}&mode=client`);
  expect(document.status).toBe(200);
  const html = String(document.body);
  expect(html).toContain('onclick="sendBudgetForSignature(event)"');
  expect(html).toContain('async function sendBudgetForSignature(event)');
  expect(html).toContain('event?.currentTarget');
  expect(html).not.toContain('const button=event && event.currentTarget');
});

test('3 · un desglose de recargos histórico corrupto no tumba el documento cliente', async ({ page }) => {
  await login(page);
  const marker = `E2E PDF corrupt breakdown ${Date.now()}`;
  const budget = await createBudget(page, marker);

  await db.serviceBlock.updateMany({
    where: { budgetId: budget.id },
    data: { surchargeBreakdown: '{json-corrupto' },
  });

  const document = await api<string>(page, `/api/pdf?id=${encodeURIComponent(budget.id)}&mode=client`);
  expect(document.status).toBe(200);
  const html = String(document.body);
  expect(html).toContain(marker);
  expect(html).not.toContain('NaN');
  expect(html).not.toContain('Infinity');
});

test('4 · snapshot comercial corrupto falla cerrado como 409 privado, no como 500 ni NaN', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E PDF corrupt commercial ${Date.now()}`);

  const updated = await db.costingQuote.updateMany({
    where: { budgetId: budget.id },
    data: { snapshot: '{snapshot-roto' },
  });
  expect(updated.count).toBeGreaterThan(0);

  const document = await api<{ error: string }>(page, `/api/pdf?id=${encodeURIComponent(budget.id)}&mode=commercial`);
  expect(document.status).toBe(409);
  expect(document.body).toEqual({ error: 'El cálculo comercial guardado no es válido' });
  expectPrivateNoStore(document);
  expect(JSON.stringify(document.body)).not.toContain('snapshot-roto');
  expect(JSON.stringify(document.body)).not.toContain('NaN');
  expect(JSON.stringify(document.body)).not.toContain('Infinity');
});
