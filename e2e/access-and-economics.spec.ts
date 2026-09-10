import { expect, test } from '@playwright/test';

const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';
const commercialPassword = process.env.E2E_COMMERCIAL_PASSWORD ?? 'E2E-Comercial-Only-2026!';

async function waitForLoginHydration(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
}

async function fillLogin(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await waitForLoginHydration(page);
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email);
  await page.locator('input#password').fill(password);
}

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await fillLogin(page, email, password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Presupuestos', { exact: true }).first()).toBeVisible();
}

test('la recuperación de contraseña es accesible sin sesión', async ({ page }) => {
  await page.goto('/login');
  await waitForLoginHydration(page);
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page).toHaveURL(/\/recuperar-password$/);
  await expect(page.getByRole('heading', { name: 'Recuperar contraseña', level: 1 })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Correo electrónico' })).toBeVisible();
});

test('credenciales inválidas no autentican y muestran un error genérico', async ({ page }) => {
  await fillLogin(page, 'no-existe@example.invalid', 'Credencial-Invalida-2026!');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Credenciales incorrectas')).toBeVisible();
});

test('doble clic rápido en login produce una única solicitud de autenticación', async ({ page }) => {
  let authPosts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/auth') authPosts += 1;
  });

  await fillLogin(page, 'e2e.maestro@example.invalid', maestroPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).dblclick({ delay: 10 });
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Presupuestos', { exact: true }).first()).toBeVisible();
  expect(authPosts).toBe(1);
});

test('la sesión autenticada persiste tras recarga y navegación atrás/adelante', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  await page.reload();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Presupuestos', { exact: true }).first()).toBeVisible();

  await page.goto('/recuperar-password');
  await expect(page.getByRole('heading', { name: 'Recuperar contraseña', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Presupuestos', { exact: true }).first()).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/recuperar-password$/);
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

test('las validaciones del presupuesto muestran feedback visible al usuario', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  await page.getByRole('button', { name: 'Nuevo Presupuesto' }).click();
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.getByText('Bloque 1: selecciona categoría profesional')).toBeVisible();
});

test('el fixture aislado expone varias categorías sintéticas sin confundirlas con tarifas reales', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const response = await page.request.get('/api/config?type=categories');
  expect(response.ok()).toBeTruthy();
  const categories = await response.json();
  const names = categories.map((category: { name: string }) => category.name);
  expect(names).toContain('E2E Enfermería sintética');
  expect(names).toContain('E2E Medicina sintética');
});

test('cálculos inválidos fallan cerrados antes de crear un presupuesto', async ({ page }) => {
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const empty = await page.request.post('/api/calculations', { data: { blocks: [] } });
  expect(empty.status()).toBe(400);
  const emptyBody = await empty.json();
  expect(emptyBody.error).toContain('al menos un bloque');

  const invalidLocation = await page.request.post('/api/calculations', {
    data: {
      blocks: [{ blockType: 'material', serviceName: 'Sintético', professionalCategory: '', dateMode: 'range', shiftType: 'morning', hoursPerDay: 8, unitType: 'unidad', quantity: 1, pricePerHour: 10, fixedPrice: 10 }],
      location: { cc: 'Territorio inexistente', province: 'Provincia inexistente' },
    },
  });
  expect(invalidLocation.status()).toBe(400);
  const locationBody = await invalidLocation.json();
  expect(locationBody.error).toContain('zona territorial válida');
});

test('comercial no puede leer appConfig ni usuarios y las categorías no filtran costes internos', async ({ page }) => {
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);
  expect((await page.request.get('/api/config?type=appConfig')).status()).toBe(403);
  expect((await page.request.get('/api/config?type=users')).status()).toBe(403);

  const categoriesResponse = await page.request.get('/api/config?type=categories');
  expect(categoriesResponse.ok()).toBeTruthy();
  const categories = await categoriesResponse.json();
  for (const category of categories) {
    expect(category).not.toHaveProperty('defaultInternalCost');
  }
});
