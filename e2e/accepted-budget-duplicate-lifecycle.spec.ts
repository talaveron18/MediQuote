import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = { totals: { calculationToken: string; totalFinal: number } };
type SavedBudget = { id: string; code: string; status: string; description: string | null; totalFinal: number };
type SavedPayload = { budget: SavedBudget; immutableArtifact?: { artifactHash: string } };
type SignatureRequest = { id: string; signingUrl: string };

async function api<T = unknown>(page: Page, path: string, method = 'GET', body?: unknown): Promise<ApiResult<T>> {
  return page.evaluate(async ({ requestPath, requestMethod, requestBody }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      credentials: 'same-origin',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    return { status: response.status, body: parsed };
  }, { requestPath: path, requestMethod: method, requestBody: body }) as Promise<ApiResult<T>>;
}

async function login(page: Page) {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error('E2E_ADMIN_PASSWORD is required');
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.admin@example.invalid');
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

function material(name: string, unitPrice: number, quantity: number) {
  return {
    blockType: 'material',
    serviceName: name,
    materialName: `${name} detalle`,
    professionalCategory: 'e2e-category-nursing',
    dateMode: 'range',
    dateRangeStart: '2026-12-10',
    dateRangeEnd: '2026-12-10',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity,
    pricePerHour: unitPrice,
    fixedPrice: unitPrice,
    ivaPercent: 21,
  };
}

async function createAcceptedSource(page: Page, marker: string) {
  const blocks = [
    material(`${marker} bloque A`, 41, 2),
    material(`${marker} bloque B`, 17, 3),
  ];
  const calculation = await api<Calculation>(page, '/api/calculations', 'POST', { blocks, discountPercent: 0, ivaPercent: 21 });
  expect(calculation.status).toBe(200);
  const saved = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001',
    calculationToken: calculation.body.totals.calculationToken,
    description: marker,
    status: 'borrador',
  });
  expect(saved.status).toBe(201);
  const signature = await api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId: saved.body.budget.id,
    recipientEmail: 'accepted.duplicate@example.invalid',
  });
  expect(signature.status).toBe(201);
  const token = new URL(signature.body.signingUrl).pathname.split('/').pop()!;
  const accepted = await api(page, '/api/public/signature', 'POST', {
    token,
    signerName: 'Cliente Duplicate E2E',
    signerEmail: 'accepted.duplicate@example.invalid',
    signatureData: validPng,
    consent: true,
  });
  expect(accepted.status).toBe(200);
  return { budget: saved.body.budget, blocks };
}

async function openDuplicate(page: Page, budget: SavedBudget) {
  await page.goto('/');
  const row = page.getByTestId(`budget-row-${budget.id}`);
  await expect(row).toBeVisible();
  await row.getByTitle('Duplicar como borrador; requiere recalcular').click();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();
}

async function calculateAndSaveDuplicate(page: Page, marker: string) {
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.getByText('Resumen del presupuesto')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  const created = await db.budget.findFirstOrThrow({
    where: { description: `${marker} (Copia)` },
    orderBy: { createdAt: 'desc' },
    include: { serviceBlocks: { orderBy: { sortOrder: 'asc' } } },
  });
  return created;
}

test('1 · duplicar un aceptado conserva exactamente sus dos bloques y no añade un bloque vacío', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate blocks ${Date.now()}`;
  const { budget } = await createAcceptedSource(page, marker);
  await openDuplicate(page, budget);

  await expect(page.locator('#svc-name-0')).toHaveValue(`${marker} bloque A`);
  await expect(page.locator('#svc-name-1')).toHaveValue(`${marker} bloque B`);
  await expect(page.locator('#svc-name-2')).toHaveCount(0);
  await expect(page.getByText('Resumen del presupuesto')).toHaveCount(0);
});

test('2 · duplicar → recalcular → guardar → reabrir crea un borrador independiente y persistente', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate persist ${Date.now()}`;
  const { budget } = await createAcceptedSource(page, marker);
  await openDuplicate(page, budget);
  const created = await calculateAndSaveDuplicate(page, marker);

  expect(created.id).not.toBe(budget.id);
  expect(created.status).toBe('borrador');
  expect(created.serviceBlocks).toHaveLength(2);
  expect(created.serviceBlocks.map((row) => row.serviceName)).toEqual([`${marker} bloque A`, `${marker} bloque B`]);

  const row = page.getByTestId(`budget-row-${created.id}`);
  await expect(row).toBeVisible();
  await row.getByTitle('Editar').click();
  await expect(page.getByRole('heading', { name: 'Editar presupuesto' })).toBeVisible();
  await expect(page.locator('#svc-name-0')).toHaveValue(`${marker} bloque A`);
  await expect(page.locator('#svc-name-1')).toHaveValue(`${marker} bloque B`);
  await expect(page.locator('#svc-name-2')).toHaveCount(0);
});

test('3 · el duplicado recalculado no hereda la firma aceptada del original', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate signature ${Date.now()}`;
  const { budget } = await createAcceptedSource(page, marker);
  await openDuplicate(page, budget);
  const created = await calculateAndSaveDuplicate(page, marker);

  expect(await db.budgetSignatureRequest.count({ where: { budgetId: budget.id, status: 'accepted' } })).toBe(1);
  expect(await db.budgetSignatureRequest.count({ where: { budgetId: created.id } })).toBe(0);
  const original = await db.budget.findUniqueOrThrow({ where: { id: budget.id } });
  expect(original.status).toBe('aceptado');
});

test('4 · el duplicado no hereda auditorías ni artefactos del original y sella su propia versión', async ({ page }) => {
  await login(page);
  const marker = `E2E duplicate artifact ${Date.now()}`;
  const { budget } = await createAcceptedSource(page, marker);
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'e2e.admin@example.invalid' } });
  const sourceAudit = await db.costAudit.create({
    data: {
      budgetId: budget.id,
      createdById: admin.id,
      estimatedCost: 100,
      actualCost: 100,
      deviationAmount: 0,
      deviationPercent: 0,
      notes: 'auditoría sintética solo del original',
    },
  });
  await db.auditLog.create({
    data: {
      action: 'sealed_cost_audit_artifact', entity: 'cost_audit', entityId: sourceAudit.id,
      userId: admin.id, result: 'success', newData: JSON.stringify({ artifactHash: `source-${marker}` }),
    },
  });

  await openDuplicate(page, budget);
  const created = await calculateAndSaveDuplicate(page, marker);

  expect(await db.costAudit.count({ where: { budgetId: budget.id } })).toBe(1);
  expect(await db.costAudit.count({ where: { budgetId: created.id } })).toBe(0);
  expect(await db.auditLog.count({ where: { action: 'sealed_cost_audit_artifact', entityId: sourceAudit.id } })).toBe(1);

  const originalArtifacts = await db.auditLog.findMany({ where: { action: 'sealed_budget_artifact', entity: 'budget', entityId: budget.id } });
  const duplicateArtifacts = await db.auditLog.findMany({ where: { action: 'sealed_budget_artifact', entity: 'budget', entityId: created.id } });
  expect(originalArtifacts.length).toBeGreaterThan(0);
  expect(duplicateArtifacts.length).toBeGreaterThan(0);
  expect(duplicateArtifacts.map((row) => row.newData)).not.toEqual(originalArtifacts.map((row) => row.newData));
});
