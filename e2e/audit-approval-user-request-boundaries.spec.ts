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
  options: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {},
): Promise<BrowserResponse> {
  return page.evaluate(async ({ requestPath, method, requestBody, hasBody }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(requestBody) : undefined,
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
    hasBody: Object.prototype.hasOwnProperty.call(options, 'body'),
  });
}

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toContain('private');
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.headers.pragma).toBe('no-cache');
  expect(response.headers.expires).toBe('0');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

async function createSyntheticBudget(marker: string) {
  const admin = await db.user.findUniqueOrThrow({ where: { email: credentials.admin.email } });
  return db.budget.create({
    data: {
      code: `E2E-GUARD-${marker}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      clientId: 'e2e-client-001',
      createdById: admin.id,
      description: marker,
      subtotal: 100,
      totalFinal: 121,
      ivaPercent: 21,
      ivaAmount: 21,
      status: 'borrador',
    },
  });
}

test.afterAll(async () => {
  await db.$disconnect();
});

test('1 · auditoría de costes rechaza cuerpos no objeto y tipos de documento inválidos sin escribir', async ({ page }) => {
  const budget = await createSyntheticBudget('cost-audit-boundary');
  await login(page, 'admin');

  for (const invalidRoot of [null, [], 'texto', 7, true]) {
    const response = await browserRequest(page, '/api/cost-audits', { method: 'POST', body: invalidRoot });
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
  }

  const invalidDocument = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: { budgetId: budget.id, actualCost: 10, documentBase64: 123 },
  });
  expect(invalidDocument.status).toBe(400);
  expectPrivateNoStore(invalidDocument);
  expect(await db.costAudit.count({ where: { budgetId: budget.id } })).toBe(0);
});

test('2 · solicitud de aprobación rechaza forma/tipos inválidos sin historial, solicitud ni notificación', async ({ page }) => {
  const budget = await createSyntheticBudget('approval-request-boundary');
  await login(page, 'admin');

  const list = await browserRequest(page, '/api/approvals');
  expect(list.status).toBe(200);
  expectPrivateNoStore(list);

  for (const invalidRoot of [null, [], 'texto', 7, true]) {
    const response = await browserRequest(page, '/api/approvals', { method: 'POST', body: invalidRoot });
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
  }

  const invalidReason = await browserRequest(page, '/api/approvals', {
    method: 'POST', body: { budgetId: budget.id, reason: { unexpected: true } },
  });
  expect(invalidReason.status).toBe(400);
  expectPrivateNoStore(invalidReason);

  expect(await db.budgetApproval.count({ where: { budgetId: budget.id } })).toBe(0);
  expect(await db.budgetHistory.count({ where: { budgetId: budget.id, action: 'approval_requested' } })).toBe(0);
  expect(await db.notification.count({ where: { entityId: budget.id, type: 'approval_requested' } })).toBe(0);
});

test('3 · decisión de aprobación inválida conserva pending y no crea efectos laterales', async ({ page }) => {
  const budget = await createSyntheticBudget('approval-decision-boundary');
  const admin = await db.user.findUniqueOrThrow({ where: { email: credentials.admin.email } });
  const approval = await db.budgetApproval.create({
    data: {
      budgetId: budget.id,
      requesterId: admin.id,
      reason: 'E2E pending guard',
      discountPercent: 0,
      status: 'pending',
    },
  });
  await login(page, 'maestro');

  const invalidComment = await browserRequest(page, '/api/approvals', {
    method: 'PATCH', body: { id: approval.id, decision: 'approved', comment: ['no', 'texto'] },
  });
  expect(invalidComment.status).toBe(400);
  expectPrivateNoStore(invalidComment);

  const invalidDecision = await browserRequest(page, '/api/approvals', {
    method: 'PATCH', body: { id: approval.id, decision: 'approve' },
  });
  expect(invalidDecision.status).toBe(400);
  expectPrivateNoStore(invalidDecision);

  const persisted = await db.budgetApproval.findUniqueOrThrow({ where: { id: approval.id } });
  expect(persisted.status).toBe('pending');
  expect(persisted.reviewerId).toBeNull();
  expect(persisted.decidedAt).toBeNull();
  expect(await db.budgetHistory.count({ where: { budgetId: budget.id, action: { in: ['approval_granted', 'approval_rejected'] } } })).toBe(0);
  expect(await db.notification.count({ where: { entityId: budget.id, type: { in: ['approval_approved', 'approval_rejected'] } } })).toBe(0);
});

test('4 · PATCH de usuarios exige acción explícita y el reset temporal nunca es cacheable', async ({ page }) => {
  const admin = await db.user.findUniqueOrThrow({ where: { email: credentials.admin.email } });
  const source = await db.user.findUniqueOrThrow({ where: { email: 'e2e.comercial@example.invalid' } });
  const target = await db.user.create({
    data: {
      email: `e2e.guard.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.invalid`,
      name: 'E2E User Guard',
      role: 'comercial',
      active: true,
      password: source.password,
      mustChangePassword: false,
      createdById: admin.id,
    },
  });
  const originalPassword = target.password;
  await login(page, 'admin');

  for (const invalidBody of [
    null,
    [],
    { id: target.id },
    { id: target.id, action: 'reset' },
    { id: target.id, action: true },
  ]) {
    const response = await browserRequest(page, '/api/users', { method: 'PATCH', body: invalidBody });
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
  }

  const untouched = await db.user.findUniqueOrThrow({ where: { id: target.id } });
  expect(untouched.password).toBe(originalPassword);
  expect(untouched.active).toBe(true);
  expect(untouched.mustChangePassword).toBe(false);

  const reset = await browserRequest(page, '/api/users', {
    method: 'PATCH', body: { id: target.id, action: 'resetPassword' },
  });
  expect(reset.status).toBe(200);
  expectPrivateNoStore(reset);
  const resetBody = reset.body as { success: boolean; temporaryPassword?: string };
  expect(resetBody.success).toBe(true);
  expect(typeof resetBody.temporaryPassword).toBe('string');
  expect(resetBody.temporaryPassword?.length).toBeGreaterThan(0);

  const changed = await db.user.findUniqueOrThrow({ where: { id: target.id } });
  expect(changed.password).not.toBe(originalPassword);
  expect(changed.mustChangePassword).toBe(true);
});
