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
  expect(headers['cache-control']).toBe('private, no-store');
  expect(headers.pragma).toBe('no-cache');
  expect(headers.expires).toBe('0');
  expect(headers['x-content-type-options']).toBe('nosniff');
}

async function rawFetch(
  page: import('@playwright/test').Page,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: string,
) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { status: response.status, text: await response.text(), headers };
  }, { path, method, body });
}

test('notifications is private/no-store and malformed or ambiguous PATCH cannot mutate all notifications', async ({ page }) => {
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);

  const before = await rawFetch(page, '/api/notifications', 'GET');
  expect(before.status).toBe(200);
  expectPrivate(before.headers);
  const beforePayload = JSON.parse(before.text) as { unreadCount: number };

  for (const body of ['{', 'null', '[]', '{"all":"true"}', '{"id":{}}']) {
    const response = await rawFetch(page, '/api/notifications', 'PATCH', body);
    expect(response.status).toBe(400);
    expectPrivate(response.headers);
  }

  const after = await rawFetch(page, '/api/notifications', 'GET');
  expect(after.status).toBe(200);
  expectPrivate(after.headers);
  expect((JSON.parse(after.text) as { unreadCount: number }).unreadCount).toBe(beforePayload.unreadCount);
});

test('internal messages and recipient directory are non-cacheable and reject invalid JSON shapes before writes', async ({ page }) => {
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);

  const inboxBefore = await rawFetch(page, '/api/messages', 'GET');
  expect(inboxBefore.status).toBe(200);
  expectPrivate(inboxBefore.headers);
  const countBefore = (JSON.parse(inboxBefore.text) as { messages: unknown[] }).messages.length;

  const recipients = await rawFetch(page, '/api/messages/recipients', 'GET');
  expect(recipients.status).toBe(200);
  expectPrivate(recipients.headers);

  for (const body of ['{', 'null', '[]', '{"recipientId":{},"subject":"x","body":"y"}', '{"recipientId":"x","subject":[],"body":"y"}']) {
    const response = await rawFetch(page, '/api/messages', 'POST', body);
    expect(response.status).toBe(400);
    expectPrivate(response.headers);
  }
  for (const body of ['{', 'null', '[]', '{"id":{}}']) {
    const response = await rawFetch(page, '/api/messages', 'PATCH', body);
    expect(response.status).toBe(400);
    expectPrivate(response.headers);
  }

  const inboxAfter = await rawFetch(page, '/api/messages', 'GET');
  expect(inboxAfter.status).toBe(200);
  expectPrivate(inboxAfter.headers);
  expect((JSON.parse(inboxAfter.text) as { messages: unknown[] }).messages.length).toBe(countBefore);
});

test('backup metadata and validation errors remain private/no-store', async ({ page }) => {
  await login(page, 'e2e.admin@example.invalid', adminPassword);

  const list = await rawFetch(page, '/api/backup?type=list', 'GET');
  expect(list.status).toBe(200);
  expectPrivate(list.headers);

  const invalidGet = await rawFetch(page, '/api/backup?type=invalid', 'GET');
  expect(invalidGet.status).toBe(400);
  expectPrivate(invalidGet.headers);

  const invalidPost = await rawFetch(page, '/api/backup?type=invalid', 'POST');
  expect(invalidPost.status).toBe(400);
  expectPrivate(invalidPost.headers);
});
