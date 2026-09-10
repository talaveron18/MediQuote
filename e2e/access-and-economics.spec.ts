import { expect, test } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';
const commercialPassword = process.env.E2E_COMMERCIAL_PASSWORD ?? 'E2E-Comercial-Only-2026!';

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email);
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Presupuestos', { exact: true }).first()).toBeVisible();
}

test('la recuperación de contraseña es accesible sin sesión', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page).toHaveURL(/\/recuperar-password$/);
  await expect(page.getByRole('heading', { name: 'Recuperar contraseña', level: 1 })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Correo electrónico' })).toBeVisible();
});

test('maestro puede abrir la economía interna y ve los valores sintéticos exactos', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  await page.getByRole('link', { name: 'Economía interna' }).click();
  await expect(page).toHaveURL(/\/economia-interna$/);
  await expect(page.getByRole('heading', { name: 'Configuración económica interna' })).toBeVisible();
  await expect(page.getByLabel('Overhead GASI sobre coste laboral ampliado')).toHaveValue('7.25');
  await expect(page.getByLabel('Comisión comercial en precio inicial')).toHaveValue('10');
  await expect(page.getByText('Todos los parámetros internos están configurados.')).toBeVisible();
});

test('comercial no ve ni puede abrir la configuración económica interna', async ({ page }) => {
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);
  await expect(page.getByRole('link', { name: 'Economía interna' })).toHaveCount(0);
  await page.goto('/economia-interna');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Economía interna' })).toHaveCount(0);
});
