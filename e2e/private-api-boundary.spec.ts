import { expect, test } from '@playwright/test';

function requiredEnv(name: 'E2E_ADMIN_PASSWORD' | 'E2E_COMMERCIAL_PASSWORD'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const adminPassword = requiredEnv('E2E_ADMIN_PASSWORD');
const commercialPassword = requiredEnv('E2E_COMMERCIAL_PASSWORD');

async function waitForLoginHydration(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
}

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await waitForLoginHydration(page);
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email);
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

type BrowserResponse = {
  status: number;
  text: string;
  headers: Record<string, string>;
};

async function browserRequest(
  page: import('@playwright/test').Page,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<BrowserResponse> {
  return page.evaluate(async ({ requestPath, method, body }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { status: response.status, text: await response.text(), headers };
  }, { requestPath: path, method: options.method ?? 'GET', body: options.body });
}

function expectPrivateHeaders(headers: Record<string, string>) {
  expect(headers['cache-control']).toBe('private, no-store');
  expect(headers.pragma).toBe('no-cache');
  expect(headers.expires).toBe('0');
  expect(headers['x-content-type-options']).toBe('nosniff');
}

test('toda la frontera API aplica no-store también a respuestas anónimas', async ({ page }) => {
  const config = await page.request.get('/api/config?type=categories');
  expect(config.status()).toBe(401);
  expectPrivateHeaders(config.headers());

  const calculations = await page.request.post('/api/calculations', { data: { blocks: [] } });
  expect(calculations.status()).toBe(401);
  expectPrivateHeaders(calculations.headers());
});

test('config conserva no-store en éxito, error de validación y denegación de permisos', async ({ page }) => {
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);

  const categories = await browserRequest(page, '/api/config?type=categories');
  expect(categories.status).toBe(200);
  expectPrivateHeaders(categories.headers);

  const invalid = await browserRequest(page, '/api/config?type=tipo-inexistente');
  expect(invalid.status).toBe(403);
  expectPrivateHeaders(invalid.headers);

  const adminOnly = await browserRequest(page, '/api/config?type=appConfig');
  expect(adminOnly.status).toBe(403);
  expectPrivateHeaders(adminOnly.headers);
});

test('calculations falla cerrado y no-cache antes de crear una cotización', async ({ page }) => {
  await login(page, 'e2e.admin@example.invalid', adminPassword);

  const emptyBlocks = await browserRequest(page, '/api/calculations', {
    method: 'POST',
    body: { blocks: [] },
  });
  expect(emptyBlocks.status).toBe(400);
  expectPrivateHeaders(emptyBlocks.headers);
  expect(emptyBlocks.text).toContain('Se requiere al menos un bloque de servicio');

  const invalidTerritory = await browserRequest(page, '/api/calculations', {
    method: 'POST',
    body: {
      blocks: [{
        id: 'e2e-private-boundary',
        blockType: 'servicio_fijo',
        name: 'Bloque sintético',
        quantity: 1,
        fixedPrice: 10,
      }],
      location: { cc: 'XX', province: 'Provincia inexistente', municipality: 'Municipio inexistente' },
    },
  });
  expect(invalidTerritory.status).toBe(400);
  expectPrivateHeaders(invalidTerritory.headers);
  expect(invalidTerritory.text).toContain('zona territorial válida');
});
