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

async function browserFetch(
  page: import('@playwright/test').Page,
  path: string,
  method = 'GET',
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

function parseJson(text: string): any {
  return JSON.parse(text);
}

test('notificaciones rechazan cuerpos ambiguos sin marcar elementos y siempre son privadas', async ({ page }) => {
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);

  const before = await browserFetch(page, '/api/notifications');
  expect(before.status).toBe(200);
  expectPrivate(before.headers);
  const beforeBody = parseJson(before.text);

  const stringAll = await browserFetch(page, '/api/notifications', 'PATCH', JSON.stringify({ all: 'true' }));
  expect(stringAll.status).toBe(400);
  expectPrivate(stringAll.headers);

  const arrayRoot = await browserFetch(page, '/api/notifications', 'PATCH', JSON.stringify([]));
  expect(arrayRoot.status).toBe(400);
  expectPrivate(arrayRoot.headers);

  const malformed = await browserFetch(page, '/api/notifications', 'PATCH', '{');
  expect(malformed.status).toBe(400);
  expectPrivate(malformed.headers);

  const after = await browserFetch(page, '/api/notifications');
  expect(after.status).toBe(200);
  const afterBody = parseJson(after.text);
  expect(afterBody.unreadCount).toBe(beforeBody.unreadCount);
  expect(afterBody.notifications.map((n: { id: string; readAt: string | null }) => [n.id, n.readAt]))
    .toEqual(beforeBody.notifications.map((n: { id: string; readAt: string | null }) => [n.id, n.readAt]));
});

test('mensajes rechazan JSON/tipos inválidos y no crean mensajes ni notificaciones', async ({ page }) => {
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);

  const messagesBefore = await browserFetch(page, '/api/messages?box=sent');
  expect(messagesBefore.status).toBe(200);
  expectPrivate(messagesBefore.headers);
  const before = parseJson(messagesBefore.text);

  const malformed = await browserFetch(page, '/api/messages', 'POST', '{');
  expect(malformed.status).toBe(400);
  expectPrivate(malformed.headers);

  const badShape = await browserFetch(page, '/api/messages', 'POST', JSON.stringify({
    recipientId: ['x'], subject: { text: 'x' }, body: true, budgetId: 42,
  }));
  expect(badShape.status).toBe(400);
  expectPrivate(badShape.headers);

  const messagesAfter = await browserFetch(page, '/api/messages?box=sent');
  const after = parseJson(messagesAfter.text);
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
  const badChange = await browserFetch(page, '/api/auth?action=change-password', 'POST', JSON.stringify({
    currentPassword: { value: adminPassword }, newPassword: 'ContraseñaSinteticaSegura-2026!',
  }));
  expect(badChange.status).toBe(400);
  expectPrivate(badChange.headers);

  const stillAuthenticated = await browserFetch(page, '/api/auth?action=me');
  expect(stillAuthenticated.status).toBe(200);
  expectPrivate(stillAuthenticated.headers);
});

test('backup central trata JSON inválido como 400 y no expone errores internos ni caché', async ({ page }) => {
  await login(page, 'e2e.admin@example.invalid', adminPassword);

  const list = await browserFetch(page, '/api/backup?type=list');
  expect(list.status).toBe(200);
  expectPrivate(list.headers);

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
