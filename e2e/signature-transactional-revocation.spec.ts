import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

const adminPassword = (() => {
  const value = process.env.E2E_ADMIN_PASSWORD;
  if (!value) throw new Error('E2E_ADMIN_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

type ApiResult<T = unknown> = { status: number; body: T };

async function api<T = unknown>(
  page: Page,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {},
): Promise<ApiResult<T>> {
  return page.evaluate(async ({ requestPath, method, requestBody }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    let body: unknown = text;
    if (text) {
      try { body = JSON.parse(text); } catch { /* non JSON */ }
    }
    return { status: response.status, body };
  }, { requestPath: path, method: options.method ?? 'GET', requestBody: options.body }) as Promise<ApiResult<T>>;
}

async function login(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.admin@example.invalid');
  await page.locator('input#password').fill(adminPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

function costingSnapshot(label: string, price: number) {
  return {
    internalCost: {
      totalInternalCost: 100,
      laborBlocks: [{ labor: { salaryForService: 70, totalPluses: 10, totalEmployerContributions: 15, totalOccupationalRisk: 5 }, managementCost: 0, terminationProvision: 0, otherContractCosts: 0, overhead: 0 }],
      directCostTotal: 0,
      directCostOverhead: 0,
    },
    commercial: { commissionAmount: 3, finalGasiBenefit: 5 },
    serviceBlocks: [{
      serviceName: label,
      professionalCategory: 'Enfermería',
      puestosSimultaneos: 1,
      pricePerHour: price / 8,
      internalCostPerHour: 12.5,
      dateMode: 'specific',
      specificDates: ['2026-10-20'],
      shiftType: 'custom',
      shiftStartTime: '08:00',
      shiftEndTime: '16:00',
      hoursPerDay: 8,
      quantity: 1,
      blockType: 'profesional_hora',
      unitType: 'hora',
      plantillaSeleccionada: 1,
      ivaPercent: 21,
    }],
    schedules: [{
      totalWorkingDays: 1,
      totalHours: 8,
      coverageHours: 8,
      totalSurcharges: 0,
      minProfessionals: 1,
      overtimeHours: 0,
      subtotal: price,
      initialPriceExVat: price,
      totalWithSurcharges: price,
      closingPriceExVat: price,
      discountAmount: 0,
      ivaAmount: price * 0.21,
      totalWithVat: price * 1.21,
      surcharges: [],
      laborWarnings: [],
    }],
    location: { id: 'ine-280796', cc: 'Madrid', province: 'Madrid', municipality: 'Madrid' },
  };
}

async function createQuote(userId: string, label: string, price: number) {
  return db.costingQuote.create({
    data: {
      userId,
      snapshot: JSON.stringify(costingSnapshot(label, price)),
      subtotal: price,
      discountPercent: 0,
      discountAmount: 0,
      ivaPercent: 21,
      ivaAmount: price * 0.21,
      totalFinal: price * 1.21,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
}

async function createBudget(page: Page, label: string, price = 160) {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'e2e.admin@example.invalid' } });
  const quote = await createQuote(admin.id, label, price);
  const created = await api<{ budget: { id: string; code: string } }>(page, '/api/budgets', {
    method: 'POST',
    body: {
      clientId: 'e2e-client-001',
      description: `${label} descripción inicial`,
      calculationToken: quote.id,
    },
  });
  expect(created.status).toBe(201);
  return { admin, budget: created.body.budget };
}

async function createSignature(page: Page, budgetId: string, email: string) {
  const created = await api<{ id: string; signingUrl: string }>(page, '/api/signatures', {
    method: 'POST',
    body: { budgetId, recipientEmail: email },
  });
  expect(created.status).toBe(201);
  const token = new URL(created.body.signingUrl).pathname.split('/').filter(Boolean).pop();
  expect(token).toBeTruthy();
  return { id: created.body.id, token: token! };
}

async function expectStoredStatus(id: string, status: string) {
  const row = await db.budgetSignatureRequest.findUniqueOrThrow({ where: { id } });
  expect(row.status).toBe(status);
}

test.beforeEach(async ({ page }) => { await login(page); });
test.afterAll(async () => { await db.$disconnect(); });

test('editar contenido firmable revoca la solicitud dentro del mismo guardado', async ({ page }) => {
  const { budget } = await createBudget(page, `E2E-SIGNABLE-${Date.now()}`);
  const signature = await createSignature(page, budget.id, 'signable@example.invalid');

  const changed = await api(page, '/api/budgets', {
    method: 'PUT',
    body: { id: budget.id, description: 'Descripción modificada después de emitir la firma' },
  });
  expect(changed.status).toBe(200);
  await expectStoredStatus(signature.id, 'revoked');

  const publicRead = await api<{ status?: string }>(page, `/api/public/signature?token=${encodeURIComponent(signature.token)}`);
  expect(publicRead.status).toBe(409);
  expect(publicRead.body.status).toBe('revoked');
});

test('recalcular importes revoca de forma transaccional el enlace emitido', async ({ page }) => {
  const { admin, budget } = await createBudget(page, `E2E-ECONOMIC-${Date.now()}`, 160);
  const signature = await createSignature(page, budget.id, 'economic@example.invalid');
  const replacementQuote = await createQuote(admin.id, 'SERVICIO_RECALCULADO', 230);

  const changed = await api(page, '/api/budgets', {
    method: 'PUT',
    body: { id: budget.id, serviceBlocks: [], calculationToken: replacementQuote.id },
  });
  expect(changed.status).toBe(200);
  await expectStoredStatus(signature.id, 'revoked');

  const persisted = await db.budget.findUniqueOrThrow({ where: { id: budget.id } });
  expect(persisted.totalFinal).toBeCloseTo(278.3, 2);
});

test('caducar presupuesto revoca el enlace antes de devolver éxito', async ({ page }) => {
  const { budget } = await createBudget(page, `E2E-EXPIRE-${Date.now()}`);
  const signature = await createSignature(page, budget.id, 'expire@example.invalid');

  const closed = await api(page, `/api/budgets?id=${encodeURIComponent(budget.id)}`, { method: 'DELETE' });
  expect(closed.status).toBe(200);
  await expectStoredStatus(signature.id, 'revoked');

  const persisted = await db.budget.findUniqueOrThrow({ where: { id: budget.id } });
  expect(persisted.status).toBe('caducado');
  const publicRead = await api<{ status?: string }>(page, `/api/public/signature?token=${encodeURIComponent(signature.token)}`);
  expect(publicRead.status).toBe(409);
  expect(publicRead.body.status).toBe('revoked');
});

test('editar solo información interna conserva una firma pendiente y utilizable', async ({ page }) => {
  const { budget } = await createBudget(page, `E2E-INTERNAL-${Date.now()}`);
  const signature = await createSignature(page, budget.id, 'internal@example.invalid');

  const changed = await api(page, '/api/budgets', {
    method: 'PUT',
    body: { id: budget.id, internalNotes: 'Nota interna de QA que el cliente no firma' },
  });
  expect(changed.status).toBe(200);
  await expectStoredStatus(signature.id, 'pending');

  const publicRead = await api<{ status: string; budget: { code: string } }>(page, `/api/public/signature?token=${encodeURIComponent(signature.token)}`);
  expect(publicRead.status).toBe(200);
  expect(publicRead.body.status).toBe('pending');
  expect(publicRead.body.budget.code).toBe(budget.code);
});
