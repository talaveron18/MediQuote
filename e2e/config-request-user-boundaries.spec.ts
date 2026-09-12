// QA retrigger 2026-09-12: non-functional marker after transient runner allocation failure.
import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

function requiredEnv(name: 'E2E_ADMIN_PASSWORD' | 'E2E_MAESTRO_PASSWORD'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const credentials = {
  admin: { email: 'e2e.admin@example.invalid', password: requiredEnv('E2E_ADMIN_PASSWORD') },
  maestro: { email: 'e2e.maestro@example.invalid', password: requiredEnv('E2E_MAESTRO_PASSWORD') },
};
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

type BrowserResponse = { status: number; headers: Record<string, string>; text: string; body: unknown };

async function login(page: Page, role: keyof typeof credentials) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(credentials[role].email);
  await page.locator('input#password').fill(credentials[role].password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function browserRequest(
  page: Page,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; rawBody?: string } = {},
): Promise<BrowserResponse> {
  return page.evaluate(async ({ requestPath, method, requestBody, rawBody, hasBody, hasRawBody }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: (hasBody || hasRawBody) ? { 'Content-Type': 'application/json' } : undefined,
      body: hasRawBody ? rawBody : (hasBody ? JSON.stringify(requestBody) : undefined),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text,
      body,
    };
  }, {
    requestPath: path,
    method: options.method ?? 'GET',
    requestBody: options.body ?? null,
    rawBody: options.rawBody ?? '',
    hasBody: Object.prototype.hasOwnProperty.call(options, 'body'),
    hasRawBody: Object.prototype.hasOwnProperty.call(options, 'rawBody'),
  });
}

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toContain('private');
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.headers.pragma).toBe('no-cache');
  expect(response.headers.expires).toBe('0');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

async function createSyntheticCommercial(marker: string) {
  const admin = await db.user.findUniqueOrThrow({ where: { email: credentials.admin.email } });
  const source = await db.user.findUniqueOrThrow({ where: { email: 'e2e.comercial@example.invalid' } });
  return db.user.create({
    data: {
      email: `e2e.config.${marker}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.invalid`,
      name: `E2E Config ${marker}`,
      role: 'comercial',
      active: true,
      password: source.password,
      mustChangePassword: false,
      permissions: null,
      createdById: admin.id,
    },
  });
}

test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: 'e2e.config.' } } });
  await db.$disconnect();
});

test('1 · POST config rechaza JSON roto y raíces no objeto sin mutar usuarios', async ({ page }) => {
  await login(page, 'admin');
  const before = await db.user.count();

  const malformed = await browserRequest(page, '/api/config?type=user', {
    method: 'POST', rawBody: '{"email":',
  });
  expect(malformed.status).toBe(400);
  expectPrivateNoStore(malformed);

  for (const invalidRoot of [null, [], 'texto', 7, true]) {
    const response = await browserRequest(page, '/api/config?type=user', {
      method: 'POST', body: invalidRoot,
    });
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
  }

  expect(await db.user.count()).toBe(before);
});

test('2 · PUT config rechaza cuerpo/ID inválido antes de tocar el usuario', async ({ page }) => {
  const target = await createSyntheticCommercial('put-shape');
  await login(page, 'admin');

  const malformed = await browserRequest(page, '/api/config?type=user', {
    method: 'PUT', rawBody: '{"id":',
  });
  expect(malformed.status).toBe(400);
  expectPrivateNoStore(malformed);

  for (const invalidBody of [null, [], { id: 123, name: 'Mutado' }, { id: '', name: 'Mutado' }]) {
    const response = await browserRequest(page, '/api/config?type=user', {
      method: 'PUT', body: invalidBody,
    });
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
  }

  const persisted = await db.user.findUniqueOrThrow({ where: { id: target.id } });
  expect(persisted.name).toBe(target.name);
  expect(persisted.role).toBe('comercial');
  expect(persisted.mustChangePassword).toBe(false);
});

test('3 · alta de usuario aplica allowlist de roles y conserva la barrera maestro/admin', async ({ page }) => {
  await login(page, 'admin');
  const invalidEmail = `e2e.config.invalid-role.${Date.now()}@example.invalid`;
  const elevatedEmail = `e2e.config.elevated-role.${Date.now()}@example.invalid`;

  const invalidRole = await browserRequest(page, '/api/config?type=user', {
    method: 'POST',
    body: { email: invalidEmail, name: 'Invalid Role', role: 'superadmin', password: 'Password-segura-12345' },
  });
  expect(invalidRole.status).toBe(400);
  expectPrivateNoStore(invalidRole);

  const elevated = await browserRequest(page, '/api/config?type=user', {
    method: 'POST',
    body: { email: elevatedEmail, name: 'Elevated Role', role: 'admin', password: 'Password-segura-12345' },
  });
  expect(elevated.status).toBe(403);
  expectPrivateNoStore(elevated);

  expect(await db.user.findUnique({ where: { email: invalidEmail } })).toBeNull();
  expect(await db.user.findUnique({ where: { email: elevatedEmail } })).toBeNull();
});

test('4 · edición de usuario ignora mass-assignment y contraseña temporal nunca es cacheable', async ({ page }) => {
  const target = await createSyntheticCommercial('mass-assignment');
  const originalCreatedById = target.createdById;
  await login(page, 'admin');

  const update = await browserRequest(page, '/api/config?type=user', {
    method: 'PUT',
    body: {
      id: target.id,
      name: 'E2E Nombre Permitido',
      permissions: JSON.stringify({ canManageUsers: true, canManageAdmins: true }),
      mustChangePassword: true,
      createdById: target.id,
    },
  });
  expect(update.status).toBe(200);
  expectPrivateNoStore(update);

  const persisted = await db.user.findUniqueOrThrow({ where: { id: target.id } });
  expect(persisted.name).toBe('E2E Nombre Permitido');
  expect(persisted.permissions).toBeNull();
  expect(persisted.mustChangePassword).toBe(false);
  expect(persisted.createdById).toBe(originalCreatedById);

  await login(page, 'maestro');
  const generatedEmail = `e2e.config.generated.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const generated = await browserRequest(page, '/api/config?type=user', {
    method: 'POST',
    body: { email: generatedEmail, name: 'Generated Password User', role: 'comercial' },
  });
  expect(generated.status).toBe(201);
  expectPrivateNoStore(generated);
  const generatedBody = generated.body as { temporaryPassword?: string };
  expect(typeof generatedBody.temporaryPassword).toBe('string');
  expect(generatedBody.temporaryPassword?.length).toBeGreaterThan(0);

  const created = await db.user.findUniqueOrThrow({ where: { email: generatedEmail } });
  expect(created.mustChangePassword).toBe(true);
});
