import { expect, test, type Page } from '@playwright/test';

function requiredEnv(name: 'E2E_ADMIN_PASSWORD' | 'E2E_COMMERCIAL_PASSWORD'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const credentials = {
  admin: { email: 'e2e.admin@example.invalid', password: requiredEnv('E2E_ADMIN_PASSWORD') },
  comercial: { email: 'e2e.comercial@example.invalid', password: requiredEnv('E2E_COMMERCIAL_PASSWORD') },
};

type BrowserResponse<T = unknown> = { status: number; headers: Record<string, string>; body: T; text: string };

async function request<T = unknown>(
  page: Page,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; rawBody?: string } = {},
): Promise<BrowserResponse<T>> {
  return page.evaluate(async ({ requestPath, method, requestBody, rawBody }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: method === 'POST' || method === 'PUT' ? { 'Content-Type': 'application/json' } : undefined,
      body: rawBody !== undefined ? rawBody : requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body, text };
  }, { requestPath: path, method: options.method ?? 'GET', requestBody: options.body, rawBody: options.rawBody }) as Promise<BrowserResponse<T>>;
}

async function login(page: Page, role: keyof typeof credentials) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(credentials[role].email);
  await page.locator('input#password').fill(credentials[role].password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.headers.pragma).toBe('no-cache');
  expect(response.headers.expires).toBe('0');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

test('1 · autenticación rechaza formas JSON incompatibles sin provocar 500', async ({ page }) => {
  await page.goto('/login');

  for (const body of [null, [], true, 7, 'texto', { email: {}, password: [] }]) {
    const response = await request(page, '/api/auth', { method: 'POST', body });
    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
  }

  const malformed = await request(page, '/api/auth', { method: 'POST', rawBody: '{"email":' });
  expect(malformed.status).toBe(401);
  expectPrivateNoStore(malformed);
});

test('2 · configuración remota autenticada permanece privada/no-cache y conserva acceso de comprobación del comercial', async ({ page }) => {
  await login(page, 'comercial');

  const check = await request(page, '/api/remote-config?type=check');
  expect([200, 500]).toContain(check.status);
  expectPrivateNoStore(check);

  const invalid = await request(page, '/api/remote-config?type=invalid');
  expect(invalid.status).toBe(400);
  expectPrivateNoStore(invalid);
});

test('3 · parámetros legales ignoran campos internos y validan tipos antes de persistir', async ({ page }) => {
  await login(page, 'admin');
  const marker = Date.now().toString();
  const key = `E2E_LEGAL_PARAMETER_${marker}`;

  const created = await request<{ id: string; key: string; isActive: boolean; value: string }>(page, '/api/legal-parameters', {
    method: 'POST',
    body: {
      key,
      label: `E2E parámetro ${marker}`,
      value: 'synthetic-test-value',
      category: 'e2e-test',
      isActive: false,
      createdAt: '1900-01-01T00:00:00.000Z',
    },
  });
  expect(created.status).toBe(201);
  expectPrivateNoStore(created);
  expect(created.body.isActive).toBe(true);

  const invalidType = await request(page, '/api/legal-parameters', {
    method: 'PUT',
    body: { id: created.body.id, value: { injected: true } },
  });
  expect(invalidType.status).toBe(400);
  expectPrivateNoStore(invalidType);

  const attemptedInternalMutation = await request<{ id: string; isActive: boolean; value: string }>(page, '/api/legal-parameters', {
    method: 'PUT',
    body: { id: created.body.id, value: 'synthetic-updated', isActive: false, createdAt: '1900-01-01T00:00:00.000Z' },
  });
  expect(attemptedInternalMutation.status).toBe(200);
  expect(attemptedInternalMutation.body.isActive).toBe(true);
  expect(attemptedInternalMutation.body.value).toBe('synthetic-updated');
});

test('4 · registros normativos ignoran campos internos y exigen booleano real para cita literal', async ({ page }) => {
  await login(page, 'admin');
  const marker = Date.now().toString();
  const key = `e2e_legal_record_${marker}`;

  const created = await request<{ id: string; key: string; isActive: boolean; hasLiteralQuote: boolean }>(page, '/api/legal-records', {
    method: 'POST',
    body: {
      key,
      title: `E2E registro ${marker}`,
      category: 'e2e-test',
      norm: 'Norma sintética de prueba',
      hasLiteralQuote: false,
      isActive: false,
      updatedAt: '1900-01-01T00:00:00.000Z',
    },
  });
  expect(created.status).toBe(201);
  expectPrivateNoStore(created);
  expect(created.body.isActive).toBe(true);

  const invalidBoolean = await request(page, '/api/legal-records', {
    method: 'PUT',
    body: { id: created.body.id, hasLiteralQuote: 'true' },
  });
  expect(invalidBoolean.status).toBe(400);
  expectPrivateNoStore(invalidBoolean);

  const attemptedInternalMutation = await request<{ id: string; isActive: boolean; title: string }>(page, '/api/legal-records', {
    method: 'PUT',
    body: { id: created.body.id, title: `E2E registro actualizado ${marker}`, isActive: false, createdAt: '1900-01-01T00:00:00.000Z' },
  });
  expect(attemptedInternalMutation.status).toBe(200);
  expect(attemptedInternalMutation.body.isActive).toBe(true);
  expect(attemptedInternalMutation.body.title).toContain('actualizado');
});
