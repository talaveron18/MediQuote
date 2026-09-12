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
type SignatureCreated = { id: string; signingUrl: string };

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

async function issueSignature(page: Page, budgetId: string, recipientEmail: string) {
  const response = await api<SignatureCreated>(page, '/api/signatures', {
    method: 'POST', body: { budgetId, recipientEmail },
  });
  expect(response.status).toBe(201);
  const token = new URL(response.body.signingUrl).pathname.split('/').filter(Boolean).pop();
  expect(token).toBeTruthy();
  return { ...response.body, token: token! };
}

function expectPrivateNoStore(response: ApiResult) {
  expect(response.headers['cache-control']).toContain('private');
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.headers['pragma']).toBe('no-cache');
}

test('1 · un presupuesto rechazado no puede reabrirse emitiendo una nueva firma', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E rejected reissue ${Date.now()}`);
  await db.budget.update({ where: { id: budget.id }, data: { status: 'rechazado' } });
  const before = await db.budgetSignatureRequest.count({ where: { budgetId: budget.id } });

  const response = await api<{ error: string }>(page, '/api/signatures', {
    method: 'POST', body: { budgetId: budget.id, recipientEmail: 'rejected.reissue@example.invalid' },
  });
  expect(response.status).toBe(409);
  expect(response.body.error).toContain('rechazado');
  expectPrivateNoStore(response);
  expect(await db.budgetSignatureRequest.count({ where: { budgetId: budget.id } })).toBe(before);
  expect((await db.budget.findUniqueOrThrow({ where: { id: budget.id }, select: { status: true } })).status).toBe('rechazado');
});

test('2 · rechazar después de emitir invalida el enlace público al abrirlo', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E rejected GET ${Date.now()}`);
  const issued = await issueSignature(page, budget.id, 'rejected.get@example.invalid');
  await db.budget.update({ where: { id: budget.id }, data: { status: 'rechazado' } });

  const response = await api<{ status?: string; error?: string }>(page, `/api/public/signature?token=${encodeURIComponent(issued.token)}`);
  expect(response.status).toBe(409);
  expect(response.body.status).toBe('revoked');
  expectPrivateNoStore(response);
  expect((await db.budgetSignatureRequest.findUniqueOrThrow({ where: { id: issued.id }, select: { status: true } })).status).toBe('revoked');
});

test('3 · rechazar después de emitir impide aceptar el enlace antiguo', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E rejected POST ${Date.now()}`);
  const recipientEmail = 'rejected.post@example.invalid';
  const issued = await issueSignature(page, budget.id, recipientEmail);
  await db.budget.update({ where: { id: budget.id }, data: { status: 'rechazado' } });

  const response = await api<{ status?: string; error?: string }>(page, '/api/public/signature', {
    method: 'POST',
    body: {
      token: issued.token,
      signerEmail: recipientEmail,
      signerName: 'Cliente Rechazado E2E',
      signatureData: validSignatureData,
      consent: true,
    },
  });
  expect(response.status).toBe(409);
  expect(response.body.error).toContain('presupuesto ha cambiado');
  expectPrivateNoStore(response);
  expect((await db.budget.findUniqueOrThrow({ where: { id: budget.id }, select: { status: true } })).status).toBe('rechazado');
  const signature = await db.budgetSignatureRequest.findUniqueOrThrow({
    where: { id: issued.id }, select: { status: true, acceptedAt: true, signerEmail: true },
  });
  expect(signature).toEqual({ status: 'revoked', acceptedAt: null, signerEmail: null });
});

test('4 · el listado autenticado normaliza la firma rechazada y no filtra documentHash', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E rejected list ${Date.now()}`);
  const issued = await issueSignature(page, budget.id, 'rejected.list@example.invalid');
  await db.budget.update({ where: { id: budget.id }, data: { status: 'rechazado' } });

  const response = await api<{ requests: Array<{ id: string; status: string }> }>(page, `/api/signatures?budgetId=${encodeURIComponent(budget.id)}`);
  expect(response.status).toBe(200);
  expectPrivateNoStore(response);
  const row = response.body.requests.find((item) => item.id === issued.id);
  expect(row?.status).toBe('revoked');
  expect(JSON.stringify(response.body)).not.toContain('documentHash');
  expect((await db.budgetSignatureRequest.findUniqueOrThrow({ where: { id: issued.id }, select: { status: true } })).status).toBe('revoked');
});
