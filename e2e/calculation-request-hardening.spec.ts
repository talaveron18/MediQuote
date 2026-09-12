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

async function rawPost(
  page: import('@playwright/test').Page,
  body: string,
): Promise<BrowserResponse> {
  return page.evaluate(async (rawBody) => {
    const response = await fetch('/api/calculations', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { status: response.status, text: await response.text(), headers };
  }, body);
}

function expectPrivateBadRequest(response: BrowserResponse) {
  expect(response.status).toBe(400);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.headers.pragma).toBe('no-cache');
  expect(response.headers.expires).toBe('0');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('cálculo rechaza JSON malformado sin convertirlo en error interno', async ({ page }) => {
  const response = await rawPost(page, '{"blocks":[');
  expectPrivateBadRequest(response);
  expect(response.text).toContain('JSON');
});

test('cálculo rechaza raíces JSON no objeto', async ({ page }) => {
  for (const payload of ['null', '[]', '"texto"', '12', 'true']) {
    const response = await rawPost(page, payload);
    expectPrivateBadRequest(response);
    expect(response.text).toContain('objeto JSON');
  }
});

test('cálculo rechaza elementos de blocks que no sean objetos', async ({ page }) => {
  for (const invalidBlock of ['null', '[]', '"bloque"', '9', 'false']) {
    const response = await rawPost(page, `{"blocks":[${invalidBlock}]}`);
    expectPrivateBadRequest(response);
    expect(response.text).toContain('Cada bloque');
  }
});

test('cálculo rechaza estructuras de fecha incompatibles antes de acceder al motor económico', async ({ page }) => {
  const invalidPayloads = [
    { blocks: [{ blockType: 'otros', quantity: 1, fixedPrice: 10, specificDates: '2026-09-12' }] },
    { blocks: [{ blockType: 'otros', quantity: 1, fixedPrice: 10, specificDates: ['2026-09-12', 123] }] },
    { blocks: [{ blockType: 'otros', quantity: 1, fixedPrice: 10, dateRangeStart: 20260912 }] },
    { blocks: [{ blockType: 'otros', quantity: 1, fixedPrice: 10, dateRangeEnd: false }] },
  ];

  for (const payload of invalidPayloads) {
    const response = await rawPost(page, JSON.stringify(payload));
    expectPrivateBadRequest(response);
  }
});
