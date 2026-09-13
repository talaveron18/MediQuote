import { expect, test } from '@playwright/test';

function requiredEnv(name: 'E2E_COMMERCIAL_PASSWORD'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const commercialPassword = requiredEnv('E2E_COMMERCIAL_PASSWORD');

function expectPrivateHeaders(headers: Record<string, string>) {
  expect(headers['cache-control']).toBe('private, no-store');
  expect(headers.pragma).toBe('no-cache');
  expect(headers.expires).toBe('0');
  expect(headers['x-content-type-options']).toBe('nosniff');
}

async function loginCommercial(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.comercial@example.invalid');
  await page.locator('input#password').fill(commercialPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

test('health público no filtra estado interno y nunca se cachea', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expectPrivateHeaders(response.headers());
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body).not.toHaveProperty('userCount');
  expect(body).not.toHaveProperty('maestroExists');
  expect(body).not.toHaveProperty('legalRecordsCount');
  expect(body).not.toHaveProperty('legalParametersCount');
});

test('bootstrap no autorizado falla cerrado y no cachea estado de instancia', async ({ request }) => {
  const response = await request.post('/api/system/bootstrap');
  expect(response.status()).toBe(401);
  expectPrivateHeaders(response.headers());
  expect(await response.json()).toEqual({ error: 'No autorizado' });
});

test('festivos exige sesión y valida filtros antes de consultar', async ({ page, request }) => {
  const anonymous = await request.get('/api/holidays?year=2026');
  expect(anonymous.status()).toBe(401);
  expectPrivateHeaders(anonymous.headers());

  await loginCommercial(page);

  const invalidYear = await page.evaluate(async () => {
    const r = await fetch('/api/holidays?year=2026%25', { credentials: 'same-origin' });
    return { status: r.status, body: await r.json(), headers: Object.fromEntries(r.headers.entries()) };
  });
  expect(invalidYear.status).toBe(400);
  expect(invalidYear.body).toEqual({ error: 'Año no válido' });
  expectPrivateHeaders(invalidYear.headers);

  const valid = await page.evaluate(async () => {
    const r = await fetch('/api/holidays?year=2026', { credentials: 'same-origin' });
    return { status: r.status, body: await r.json(), headers: Object.fromEntries(r.headers.entries()) };
  });
  expect(valid.status).toBe(200);
  expect(Array.isArray(valid.body.holidays)).toBe(true);
  expectPrivateHeaders(valid.headers);
});
