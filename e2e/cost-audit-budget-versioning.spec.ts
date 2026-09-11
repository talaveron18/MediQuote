import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';

function requiredEnv(name: 'E2E_ADMIN_PASSWORD'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const adminPassword = requiredEnv('E2E_ADMIN_PASSWORD');
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.admin@example.invalid');
  await page.locator('input#password').fill(adminPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

type BrowserResponse = { status: number; text: string; headers: Record<string, string> };

async function browserRequest(
  page: import('@playwright/test').Page,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {},
): Promise<BrowserResponse> {
  return page.evaluate(async ({ requestPath, method, body }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { status: response.status, text: await response.text(), headers };
  }, { requestPath: path, method: options.method ?? 'GET', body: options.body });
}

function snapshotV1() {
  return {
    internalCost: {
      totalInternalCost: 138,
      laborBlocks: [{
        labor: {
          salaryForService: 70,
          totalPluses: 10,
          totalEmployerContributions: 25,
          totalOccupationalRisk: 5,
        },
        managementCost: 10,
        terminationProvision: 0,
        otherContractCosts: 0,
        overhead: 8,
      }],
      directCostTotal: 5,
      directCostOverhead: 0,
    },
    commercial: { commissionAmount: 4, finalGasiBenefit: 6 },
  };
}

function snapshotV2() {
  return {
    internalCost: {
      totalInternalCost: 160,
      laborBlocks: [{
        labor: {
          salaryForService: 80,
          totalPluses: 12,
          totalEmployerContributions: 30,
          totalOccupationalRisk: 6,
        },
        managementCost: 12,
        terminationProvision: 0,
        otherContractCosts: 0,
        overhead: 9,
      }],
      directCostTotal: 6,
      directCostOverhead: 0,
    },
    commercial: { commissionAmount: 5, finalGasiBenefit: 7 },
    serviceBlocks: [{
      serviceName: 'Cobertura sanitaria sintética v2',
      professionalCategory: 'Enfermería',
      puestosSimultaneos: 2,
      pricePerHour: 40,
      internalCostPerHour: 20,
      dateMode: 'specific',
      specificDates: ['2026-10-10'],
      shiftType: 'custom',
      shiftStartTime: '08:00',
      shiftEndTime: '16:00',
      hoursPerDay: 8,
      quantity: 1,
      blockType: 'profesional_hora',
      unitType: 'hora',
      plantillaSeleccionada: 2,
      ivaPercent: 21,
    }],
    schedules: [{
      totalWorkingDays: 1,
      totalHours: 16,
      coverageHours: 16,
      totalSurcharges: 0,
      minProfessionals: 2,
      overtimeHours: 0,
      subtotal: 200,
      initialPriceExVat: 200,
      totalWithSurcharges: 200,
      closingPriceExVat: 200,
      discountAmount: 0,
      ivaAmount: 42,
      totalWithVat: 242,
      surcharges: [],
      laborWarnings: [],
    }],
    location: {
      id: 'ine-280796',
      cc: 'Madrid',
      province: 'Madrid',
      municipality: 'Madrid',
    },
  };
}

async function seedVersionedBudget(code: string) {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'e2e.admin@example.invalid' } });
  const budget = await db.budget.create({
    data: {
      code,
      clientId: 'e2e-client-001',
      createdById: admin.id,
      description: 'versión sintética v1',
      subtotal: 150,
      totalFinal: 181.5,
      ivaPercent: 21,
      ivaAmount: 31.5,
    },
  });
  await db.costingQuote.create({
    data: {
      userId: admin.id,
      budgetId: budget.id,
      snapshot: JSON.stringify(snapshotV1()),
      subtotal: 150,
      discountPercent: 0,
      discountAmount: 0,
      ivaPercent: 21,
      ivaAmount: 31.5,
      totalFinal: 181.5,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(Date.now() - 2_000),
    },
  });
  return { admin, budget };
}

async function createFirstAudit(page: import('@playwright/test').Page, budgetId: string) {
  const response = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId,
      actualCost: 120,
      actualBreakdown: { salary: 70, pluses: 10 },
      notes: 'auditoría histórica v1',
    },
  });
  expect(response.status).toBe(201);
  return (JSON.parse(response.text) as { audit: { id: string } }).audit.id;
}

async function editEconomicsToV2(page: import('@playwright/test').Page, userId: string, budgetId: string) {
  const quote = await db.costingQuote.create({
    data: {
      userId,
      snapshot: JSON.stringify(snapshotV2()),
      subtotal: 200,
      discountPercent: 0,
      discountAmount: 0,
      ivaPercent: 21,
      ivaAmount: 42,
      totalFinal: 242,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const response = await browserRequest(page, '/api/budgets', {
    method: 'PUT',
    body: {
      id: budgetId,
      description: 'versión sintética v2',
      serviceBlocks: [{ synthetic: true }],
      calculationToken: quote.id,
    },
  });
  expect(response.status).toBe(200);
  const body = JSON.parse(response.text) as { immutableArtifact: { version: number; artifactHash: string } };
  return body.immutableArtifact;
}

async function auditArtifactPayload(auditId: string) {
  const row = await db.auditLog.findFirstOrThrow({
    where: { action: 'sealed_cost_audit_artifact', entity: 'cost_audit', entityId: auditId },
    orderBy: { createdAt: 'desc' },
  });
  const artifact = JSON.parse(row.newData || '{}') as { artifactHash: string; payloadCanonical: string };
  return { artifact, payload: JSON.parse(artifact.payloadCanonical) as Record<string, unknown> };
}

async function sealedBudgetArtifacts(budgetId: string) {
  const rows = await db.budgetHistory.findMany({
    where: { budgetId, action: 'sealed_budget_artifact' },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => JSON.parse(row.snapshot || '{}') as {
    version: number;
    artifactHash: string;
    payloadCanonical: string;
  });
}

test.afterAll(async () => {
  await db.$disconnect();
});

test('auditoría posterior a edición económica enlaza la nueva baseline y no la histórica', async ({ page }) => {
  const { admin, budget } = await seedVersionedBudget(`E2E-AUD-VERSION-LINK-${Date.now()}`);
  await login(page);
  const firstAuditId = await createFirstAudit(page, budget.id);
  const firstArtifact = await auditArtifactPayload(firstAuditId);
  const firstBaselineHash = String(firstArtifact.payload.originalBudgetArtifactHash);

  const v2Artifact = await editEconomicsToV2(page, admin.id, budget.id);
  expect(v2Artifact.artifactHash).not.toBe(firstBaselineHash);

  const second = await browserRequest(page, '/api/cost-audits', {
    method: 'POST', body: { budgetId: budget.id, actualCost: 140, actualBreakdown: { salary: 80, pluses: 12 } },
  });
  expect(second.status).toBe(201);
  const secondAuditId = (JSON.parse(second.text) as { audit: { id: string } }).audit.id;
  const secondArtifact = await auditArtifactPayload(secondAuditId);
  expect(secondArtifact.payload.originalBudgetArtifactHash).toBe(v2Artifact.artifactHash);
  expect(secondArtifact.payload.originalBudgetArtifactHash).not.toBe(firstBaselineHash);
});

test('auditoría histórica permanece byte-for-byte inmutable tras editar y volver a auditar', async ({ page }) => {
  const { admin, budget } = await seedVersionedBudget(`E2E-AUD-VERSION-IMMUTABLE-${Date.now()}`);
  await login(page);
  const firstAuditId = await createFirstAudit(page, budget.id);
  const storedBefore = await db.costAudit.findUniqueOrThrow({ where: { id: firstAuditId } });
  const artifactBefore = await db.auditLog.findFirstOrThrow({
    where: { action: 'sealed_cost_audit_artifact', entity: 'cost_audit', entityId: firstAuditId },
  });

  await editEconomicsToV2(page, admin.id, budget.id);
  const second = await browserRequest(page, '/api/cost-audits', {
    method: 'POST', body: { budgetId: budget.id, actualCost: 141, actualBreakdown: { salary: 81 } },
  });
  expect(second.status).toBe(201);

  const storedAfter = await db.costAudit.findUniqueOrThrow({ where: { id: firstAuditId } });
  const artifactAfter = await db.auditLog.findFirstOrThrow({
    where: { action: 'sealed_cost_audit_artifact', entity: 'cost_audit', entityId: firstAuditId },
  });
  expect(storedAfter).toEqual(storedBefore);
  expect(artifactAfter.newData).toBe(artifactBefore.newData);
});

test('nueva auditoría calcula contra la cotización económica v2 y no contra la v1', async ({ page }) => {
  const { admin, budget } = await seedVersionedBudget(`E2E-AUD-VERSION-COST-${Date.now()}`);
  await login(page);
  const firstAuditId = await createFirstAudit(page, budget.id);
  const firstStored = await db.costAudit.findUniqueOrThrow({ where: { id: firstAuditId } });
  expect(firstStored.estimatedCost).toBe(120);

  await editEconomicsToV2(page, admin.id, budget.id);
  const second = await browserRequest(page, '/api/cost-audits', {
    method: 'POST', body: { budgetId: budget.id, actualCost: 140, actualBreakdown: { salary: 80 } },
  });
  expect(second.status).toBe(201);
  const secondAuditId = (JSON.parse(second.text) as { audit: { id: string } }).audit.id;
  const secondStored = await db.costAudit.findUniqueOrThrow({ where: { id: secondAuditId } });
  expect(secondStored.estimatedCost).toBe(140);
  expect(secondStored.estimatedCost).not.toBe(firstStored.estimatedCost);
});

test('historial conserva ambas versiones y ambas auditorías después de recarga', async ({ page }) => {
  const { admin, budget } = await seedVersionedBudget(`E2E-AUD-VERSION-HISTORY-${Date.now()}`);
  await login(page);
  const firstAuditId = await createFirstAudit(page, budget.id);
  const firstAuditArtifact = await auditArtifactPayload(firstAuditId);

  const v2Artifact = await editEconomicsToV2(page, admin.id, budget.id);
  const second = await browserRequest(page, '/api/cost-audits', {
    method: 'POST', body: { budgetId: budget.id, actualCost: 140, actualBreakdown: { salary: 80, pluses: 12 } },
  });
  expect(second.status).toBe(201);
  const secondAuditId = (JSON.parse(second.text) as { audit: { id: string } }).audit.id;

  await page.reload();
  const listed = await browserRequest(page, '/api/cost-audits');
  expect(listed.status).toBe(200);
  const audits = (JSON.parse(listed.text) as { audits: Array<{ id: string; budgetId: string }> }).audits;
  expect(audits.some((audit) => audit.id === firstAuditId && audit.budgetId === budget.id)).toBe(true);
  expect(audits.some((audit) => audit.id === secondAuditId && audit.budgetId === budget.id)).toBe(true);

  const artifacts = await sealedBudgetArtifacts(budget.id);
  expect(artifacts.length).toBeGreaterThanOrEqual(2);
  const hashes = artifacts.map((artifact) => artifact.artifactHash);
  expect(new Set(hashes).size).toBe(hashes.length);
  expect(hashes).toContain(String(firstAuditArtifact.payload.originalBudgetArtifactHash));
  expect(hashes).toContain(v2Artifact.artifactHash);
  expect(String(firstAuditArtifact.payload.originalBudgetArtifactHash)).not.toBe(v2Artifact.artifactHash);
});