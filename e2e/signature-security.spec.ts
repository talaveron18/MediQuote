import { expect, test, type Page } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';
const commercialPassword = process.env.E2E_COMMERCIAL_PASSWORD ?? 'E2E-Comercial-Only-2026!';

type ApiResult<T = unknown> = { status: number; body: T };

type Calculation = {
  totals: { calculationToken: string; totalFinal: number };
  commercial: { status: string };
};

type CreatedBudget = { budget: { id: string; code: string } };

type SignatureRequest = { id: string; signingUrl: string };

async function api<T = unknown>(
  page: Page,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {},
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

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email);
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function logout(page: Page) {
  await api(page, '/api/auth', { method: 'POST', body: { action: 'logout' } });
  await page.goto('/login');
}

function block(label: string, price: number) {
  return {
    blockType: 'material',
    serviceName: label,
    professionalCategory: 'e2e-category-nursing',
    dateMode: 'range',
    dateRangeStart: '2026-10-12',
    dateRangeEnd: '2026-10-12',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity: 1,
    pricePerHour: price,
    fixedPrice: price,
    ivaPercent: 21,
  };
}

async function calculate(page: Page, label = 'Firma E2E', price = 17) {
  const result = await api<Calculation>(page, '/api/calculations', {
    method: 'POST',
    body: { blocks: [block(label, price)], discountPercent: 0, ivaPercent: 21 },
  });
  expect(result.status).toBe(200);
  expect(result.body.commercial.status).toBe('calculated');
  expect(result.body.totals.calculationToken).toBeTruthy();
  return result.body;
}

async function createBudget(page: Page, marker: string) {
  const calculation = await calculate(page, marker);
  const result = await api<CreatedBudget>(page, '/api/budgets', {
    method: 'POST',
    body: {
      clientId: 'e2e-client-001',
      calculationToken: calculation.totals.calculationToken,
      description: marker,
      status: 'borrador',
    },
  });
  expect(result.status).toBe(201);
  return result.body.budget;
}

async function requestSignature(page: Page, budgetId: string, email = 'cliente@example.invalid') {
  const result = await api<SignatureRequest>(page, '/api/signatures', {
    method: 'POST',
    body: { budgetId, recipientEmail: email },
  });
  expect(result.status).toBe(201);
  const token = new URL(result.body.signingUrl).pathname.split('/').pop()!;
  return { ...result.body, token };
}

test('1 · endpoints privados de firma y certificado exigen sesión antes de enumerar recursos', async ({ page }) => {
  await page.goto('/login');
  const listing = await api<{ error: string }>(page, '/api/signatures?budgetId=presupuesto-inexistente');
  const certificate = await api<{ error: string }>(page, '/api/signatures?certificate=certificado-inexistente');
  expect(listing.status).toBe(401);
  expect(certificate.status).toBe(401);
  expect(listing.body.error).toMatch(/autentic/i);
  expect(certificate.body.error).toMatch(/autentic/i);
});

test('2 · comercial no puede listar ni crear firma para un presupuesto ajeno del maestro', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const budget = await createBudget(page, 'E2E RBAC firma ajena');
  await logout(page);
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);

  const listing = await api<{ error: string }>(page, `/api/signatures?budgetId=${encodeURIComponent(budget.id)}`);
  const creation = await api<{ error: string }>(page, '/api/signatures', {
    method: 'POST',
    body: { budgetId: budget.id, recipientEmail: 'cliente@example.invalid' },
  });
  expect(listing.status).toBe(404);
  expect(creation.status).toBe(404);
  expect(listing.body.error).toMatch(/no encontrado/i);
  expect(creation.body.error).toMatch(/no encontrado/i);
});

test('3 · una nueva solicitud revoca el enlace de firma anterior y deja solo el último pendiente', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const budget = await createBudget(page, 'E2E revocación firma sucesiva');
  const first = await requestSignature(page, budget.id, 'primero@example.invalid');
  const second = await requestSignature(page, budget.id, 'segundo@example.invalid');

  const oldLink = await api<{ status: string }>(page, `/api/public/signature?token=${encodeURIComponent(first.token)}`);
  const currentLink = await api<{ status: string; recipientEmail: string }>(page, `/api/public/signature?token=${encodeURIComponent(second.token)}`);
  expect(oldLink.status).toBe(200);
  expect(oldLink.body.status).toBe('revoked');
  expect(currentLink.status).toBe(200);
  expect(currentLink.body.status).toBe('pending');
  expect(currentLink.body.recipientEmail).toBe('segundo@example.invalid');
});

test('4 · editar el presupuesto después de emitir firma invalida el enlace por huella documental obsoleta', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const budget = await createBudget(page, 'E2E firma documento v1');
  const signature = await requestSignature(page, budget.id);

  const editedCalculation = await calculate(page, 'E2E firma documento v2', 31);
  const edited = await api(page, '/api/budgets', {
    method: 'PUT',
    body: {
      id: budget.id,
      serviceBlocks: [],
      calculationToken: editedCalculation.totals.calculationToken,
      description: 'E2E firma documento v2',
    },
  });
  expect(edited.status).toBe(200);

  const stale = await api<{ status: string; error: string }>(page, `/api/public/signature?token=${encodeURIComponent(signature.token)}`);
  expect(stale.status).toBe(409);
  expect(stale.body.status).toBe('revoked');
  expect(stale.body.error).toMatch(/presupuesto ha cambiado/i);

  const secondRead = await api<{ status: string }>(page, `/api/public/signature?token=${encodeURIComponent(signature.token)}`);
  expect(secondRead.status).toBe(200);
  expect(secondRead.body.status).toBe('revoked');
});
