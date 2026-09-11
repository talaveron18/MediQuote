import { expect, test, type Page } from '@playwright/test';

const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

type BrowserResponse = { status: number; headers: Record<string, string>; body: unknown };

async function login(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(maestroPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function get(page: Page, path: string): Promise<BrowserResponse> {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, { credentials: 'same-origin' });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
  }, path);
}

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toContain('private');
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.headers['pragma']).toBe('no-cache');
  expect(response.headers['expires']).toBe('0');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

test('errores 400 y 404 de /api/pdf son privados y no cacheables', async ({ page }) => {
  await login(page);

  const missingId = await get(page, '/api/pdf?mode=client');
  expect(missingId.status).toBe(400);
  expect(missingId.body).toEqual({ error: 'ID requerido' });
  expectPrivateNoStore(missingId);

  const notFound = await get(page, '/api/pdf?id=pdf-private-does-not-exist&mode=client');
  expect(notFound.status).toBe(404);
  expect(notFound.body).toEqual({ error: 'Presupuesto no encontrado' });
  expectPrivateNoStore(notFound);
});
