import { expect, test } from '@playwright/test';

function requiredEnv(name: 'E2E_ADMIN_PASSWORD'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const adminPassword = requiredEnv('E2E_ADMIN_PASSWORD');

type BrowserResponse = {
  status: number;
  text: string;
  headers: Record<string, string>;
};

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.admin@example.invalid');
  await page.locator('input#password').fill(adminPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function browserRequest(
  page: import('@playwright/test').Page,
  path: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<BrowserResponse> {
  return page.evaluate(async ({ requestPath, requestMethod }) => {
    const response = await fetch(requestPath, { method: requestMethod, credentials: 'same-origin' });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { status: response.status, text: await response.text(), headers };
  }, { requestPath: path, requestMethod: method });
}

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.headers.pragma).toBe('no-cache');
  expect(response.headers.expires).toBe('0');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

test('configuración y endpoints económicos administrativos no quedan cacheables en navegador', async ({ page }) => {
  await login(page);

  const users = await browserRequest(page, '/api/config?type=users');
  expect(users.status).toBe(200);
  expectPrivateNoStore(users);

  const missingCosting = await browserRequest(page, '/api/costing?budgetId=e2e-missing-budget');
  expect(missingCosting.status).toBe(404);
  expectPrivateNoStore(missingCosting);

  const invalidAuditPackage = await browserRequest(page, '/api/audit-package?type=invalid', 'POST');
  expect(invalidAuditPackage.status).toBe(400);
  expectPrivateNoStore(invalidAuditPackage);
});
