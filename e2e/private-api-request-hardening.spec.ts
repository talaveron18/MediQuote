import { expect, test } from '@playwright/test';

function requiredEnv(name: 'E2E_ADMIN_PASSWORD' | 'E2E_COMMERCIAL_PASSWORD'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const adminPassword = requiredEnv('E2E_ADMIN_PASSWORD');
const commercialPassword = requiredEnv('E2E_COMMERCIAL_PASSWORD');

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email);
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

function expectPrivate(headers: Record<string, string>) {
  expect(headers['cache-control']).toContain('no-store');
  expect(headers.pragma).toBe('no-cache');
  expect(headers['x-content-type-options']).toBe('nosniff');
}

async function rawFetch(
  page: import('@playwright/test').Page,
  path: string,
  method: string,
  body?: string,
  contentType = 'application/json',
) {
  return page.evaluate(async ({ path, method, body, contentType }) => {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': contentType },
      body,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { status: response.status, text: await response.text(), headers };
  }, { path, method, body, contentType });
}

test('notificaciones rechazan cuerpos ambiguos sin marcar elementos y siempre son privadas', async ({ page }) => {
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);

  const before = await page.request.get('/api/notifications');
  expect(before.status()).toBe(200);
  expectPrivate(before.headers());
  const beforeBody = await before.json();

  const stringAll = await page.request.patch('/api/notifications', { data: { all: 'true' } });
  expect(stringAll.status()).toBe(400);
  expectPrivate(stringAll.headers());

  const arrayRoot = await page.request.patch('/api/notifications', { data: [] });
  expect(arrayRoot.status()).toBe(400);
  expectPrivate(arrayRoot.headers());

  const malformed = await rawFetch(page, '/api/notifications', 'PATCH', '{');
  expect(malformed.status).toBe(400);
  expectPrivate(malformed.headers);

  const after = await page.request.get('/api/notifications');
  expect(after.status()).toBe(200);
  const afterBody = await after.json();
  expect(afterBody.unreadCount).toBe(beforeBody.unreadCount);
  expect(afterBody.notifications.map((n: { id: string; readAt: string | null }) => [n.id, n.readAt]))
    .toEqual(beforeBody.notifications.map((n: { id: string; readAt: string | null }) => [n.id, n.readAt]));
});

test('mensajes rechazan JSON/tipos inválidos y no crean mensajes ni notificaciones', async ({ page }) => {
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);

  const messagesBefore = await page.request.get('/api/messages?box=sent');
  expect(messagesBefore.status()).toBe(200);
  expectPrivate(messagesBefore.headers());
  const before = await messagesBefore.json();

  const malformed = await rawFetch(page, '/api/messages', 'POST', '{');
  expect(malformed.status).toBe(400);
  expectPrivate(malformed.headers);

  const badShape = await page.request.post('/api/messages', {
    data: { recipientId: ['x'], subject: { text: 'x' }, body: true, budgetId: 42 },
  });
  expect(badShape.status()).toBe(400);
  expectPrivate(badShape.headers());

  const messagesAfter = await page.request.get('/api/messages?box=sent');
  const after = await messagesAfter.json();
  expect(after.messages.map((m: { id: string }) => m.id)).toEqual(before.messages.map((m: { id: string }) => m.id));
});

test('autenticación rechaza credenciales no textuales sin 500 ni sesión accidental', async ({ page }) => {
  for (const data of [
    { email: { value: 'e2e.admin@example.invalid' }, password: adminPassword },
    { email: 'e2e.admin@example.invalid', password: { value: adminPassword } },
    [],
    null,
  ]) {
    const response = await page.request.post('/api/auth', { data });
    expect(response.status()).toBe(401);
    expectPrivate(response.headers());
  }

  await login(page, 'e2e.admin@example.invalid', adminPassword);
  const badChange = await page.request.post('/api/auth?action=change-password', {
    data: { currentPassword: { value: adminPassword }, newPassword: 'ContraseñaSinteticaSegura-2026!' },
  });
  expect(badChange.status()).toBe(400);
  expectPrivate(badChange.headers());

  const stillAuthenticated = await page.request.get('/api/auth?action=me');
  expect(stillAuthenticated.status()).toBe(200);
});

test('backup central trata JSON inválido como 400 y no expone errores internos ni caché', async ({ page }) => {
  await login(page, 'e2e.admin@example.invalid', adminPassword);

  const list = await page.request.get('/api/backup?type=list');
  expect(list.status()).toBe(200);
  expectPrivate(list.headers());

  const result = await page.evaluate(async () => {
    const form = new FormData();
    form.append('database', new File(['{json roto'], 'backup.json', { type: 'application/json' }));
    const response = await fetch('/api/backup?type=import', { method: 'POST', credentials: 'same-origin', body: form });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { status: response.status, text: await response.text(), headers };
  });
  expect(result.status).toBe(400);
  expectPrivate(result.headers);
  expect(result.text).toContain('JSON válido');
  expect(result.text).not.toContain('SyntaxError');
  expect(result.text).not.toContain('Unexpected token');
});
