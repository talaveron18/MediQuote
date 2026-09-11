import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';

function requiredEnv(name: 'E2E_ADMIN_PASSWORD'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const adminPassword = requiredEnv('E2E_ADMIN_PASSWORD');
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function waitForLoginHydration(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await waitForLoginHydration(page);
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.admin@example.invalid');
  await page.locator('input#password').fill(adminPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

type BrowserResponse = { status: number; text: string; headers: Record<string, string> };

async function browserRequest(
  page: import('@playwright/test').Page,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
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

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.headers.pragma).toBe('no-cache');
  expect(response.headers.expires).toBe('0');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

const snapshot = JSON.stringify({
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
});

async function seedAuditableBudget(code: string) {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'e2e.admin@example.invalid' } });
  const budget = await db.budget.create({
    data: {
      code,
      clientId: 'e2e-client-001',
      createdById: admin.id,
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
      snapshot,
      subtotal: 150,
      discountPercent: 0,
      discountAmount: 0,
      ivaPercent: 21,
      ivaAmount: 31.5,
      totalFinal: 181.5,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    },
  });
  return budget;
}

test.afterAll(async () => {
  await db.$disconnect();
});

test('desglose parcial produce match/mismatch/not_provided concepto a concepto sin mezclar costes internos', async ({ page }) => {
  const budget = await seedAuditableBudget(`E2E-AUD-PARTIAL-${Date.now()}`);
  await login(page);

  const created = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId: budget.id,
      actualCost: 122,
      actualBreakdown: { salary: 70, pluses: 12 },
      notes: 'conciliación parcial sintética',
    },
  });
  expect(created.status).toBe(201);
  expectPrivateNoStore(created);
  const body = JSON.parse(created.text) as { audit: { id: string } };

  const stored = await db.costAudit.findUniqueOrThrow({ where: { id: body.audit.id } });
  const analysis = JSON.parse(stored.analysis || '{}') as {
    reconciliation: Array<{ key: string; status: string; actual: number | null }>;
    internal: Array<{ key: string; status: string; amount: number }>;
  };
  const statuses = Object.fromEntries(analysis.reconciliation.map((item) => [item.key, item.status]));
  expect(statuses.salary).toBe('match');
  expect(statuses.pluses).toBe('mismatch');
  expect(statuses.socialSecurity).toBe('not_provided');
  expect(statuses.occupationalRisk).toBe('not_provided');
  expect(statuses.contractCosts).toBe('not_provided');
  expect(analysis.reconciliation.map((item) => item.key)).not.toContain('overhead');
  expect(analysis.reconciliation.map((item) => item.key)).not.toContain('commercialCommission');
  expect(analysis.internal.map((item) => item.key)).toEqual(expect.arrayContaining([
    'overhead', 'directCosts', 'commercialCommission', 'gasiBenefit',
  ]));
  expect(analysis.internal.every((item) => item.status === 'internal')).toBe(true);
});

test('auditoría queda enlazada al artefacto inmutable del presupuesto y conserva snapshot económico', async ({ page }) => {
  const budget = await seedAuditableBudget(`E2E-AUD-LINK-${Date.now()}`);
  await login(page);

  const created = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: { budgetId: budget.id, actualCost: 120, actualBreakdown: { salary: 70 } },
  });
  expect(created.status).toBe(201);
  const body = JSON.parse(created.text) as {
    audit: { id: string };
    immutableArtifact: { version: number; artifactHash: string };
  };
  expect(body.immutableArtifact.version).toBe(1);

  const budgetHistory = await db.budgetHistory.findFirstOrThrow({
    where: { budgetId: budget.id, action: 'sealed_budget_artifact' },
    orderBy: { createdAt: 'desc' },
  });
  const budgetArtifact = JSON.parse(budgetHistory.snapshot || '{}') as {
    artifactHash: string;
    payloadCanonical: string;
  };
  expect(budgetArtifact.artifactHash).toMatch(/^[a-f0-9]{64}$/);
  const budgetPayload = JSON.parse(budgetArtifact.payloadCanonical) as { economicSnapshot: unknown };
  expect(budgetPayload.economicSnapshot).toEqual(JSON.parse(snapshot));

  const auditHistory = await db.auditLog.findFirstOrThrow({
    where: { action: 'sealed_cost_audit_artifact', entity: 'cost_audit', entityId: body.audit.id },
    orderBy: { createdAt: 'desc' },
  });
  const auditArtifact = JSON.parse(auditHistory.newData || '{}') as {
    artifactHash: string;
    payloadCanonical: string;
  };
  const auditPayload = JSON.parse(auditArtifact.payloadCanonical) as {
    originalBudgetArtifactHash: string;
    budgetId: string;
  };
  expect(auditArtifact.artifactHash).toBe(body.immutableArtifact.artifactHash);
  expect(auditPayload.originalBudgetArtifactHash).toBe(budgetArtifact.artifactHash);
  expect(auditPayload.budgetId).toBe(budget.id);
});

test('historial API conserva conciliación parcial tras recarga y no expone documento binario en listado', async ({ page }) => {
  const budget = await seedAuditableBudget(`E2E-AUD-HISTORY-${Date.now()}`);
  await login(page);

  const created = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId: budget.id,
      actualCost: 121,
      actualBreakdown: { salary: 71 },
      documentName: 'gestoria.pdf',
      documentType: 'application/pdf',
      documentBase64: Buffer.from('%PDF-sintetico').toString('base64'),
    },
  });
  expect(created.status).toBe(201);
  const body = JSON.parse(created.text) as { audit: { id: string } };

  await page.reload();
  const listed = await browserRequest(page, '/api/cost-audits');
  expect(listed.status).toBe(200);
  expectPrivateNoStore(listed);
  const listBody = JSON.parse(listed.text) as { audits: Array<Record<string, unknown>> };
  const found = listBody.audits.find((item) => item.id === body.audit.id);
  expect(found).toBeTruthy();
  expect(found?.budgetId).toBe(budget.id);
  expect(found?.hasDocument).toBe(true);
  expect(found).not.toHaveProperty('documentData');
  expect(JSON.parse(String(found?.actualBreakdown))).toEqual({ salary: 71 });
  const analysis = JSON.parse(String(found?.analysis)) as { reconciliation: Array<{ key: string; status: string }> };
  expect(analysis.reconciliation.find((item) => item.key === 'salary')?.status).toBe('mismatch');
  expect(analysis.reconciliation.find((item) => item.key === 'pluses')?.status).toBe('not_provided');
});

test('coherencia total-desglose falla cerrado sin persistencia para parcial imposible o completo descuadrado', async ({ page }) => {
  const budget = await seedAuditableBudget(`E2E-AUD-INTEGRITY-${Date.now()}`);
  const before = await db.costAudit.count({ where: { budgetId: budget.id } });
  await login(page);

  const partialOverTotal = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: { budgetId: budget.id, actualCost: 50, actualBreakdown: { salary: 51 } },
  });
  expect(partialOverTotal.status).toBe(400);
  expectPrivateNoStore(partialOverTotal);
  expect(partialOverTotal.text).toContain('no puede superar el coste real total');

  const fullMismatch = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId: budget.id,
      actualCost: 121,
      actualBreakdown: {
        salary: 70,
        pluses: 10,
        socialSecurity: 25,
        occupationalRisk: 5,
        contractCosts: 10,
      },
    },
  });
  expect(fullMismatch.status).toBe(400);
  expectPrivateNoStore(fullMismatch);
  expect(fullMismatch.text).toContain('debe cuadrar con el coste real total');
  expect(await db.costAudit.count({ where: { budgetId: budget.id } })).toBe(before);
});

test('dos auditorías sucesivas conservan filas y conciliaciones independientes', async ({ page }) => {
  const budget = await seedAuditableBudget(`E2E-AUD-REPEAT-${Date.now()}`);
  await login(page);

  const first = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId: budget.id,
      actualCost: 120,
      actualBreakdown: { salary: 70, pluses: 10 },
      notes: 'primera auditoría sintética',
    },
  });
  expect(first.status).toBe(201);
  const firstBody = JSON.parse(first.text) as { audit: { id: string } };
  const firstStoredBefore = await db.costAudit.findUniqueOrThrow({ where: { id: firstBody.audit.id } });

  const second = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId: budget.id,
      actualCost: 124,
      actualBreakdown: { salary: 72, pluses: 11 },
      notes: 'segunda auditoría sintética',
    },
  });
  expect(second.status).toBe(201);
  const secondBody = JSON.parse(second.text) as { audit: { id: string } };
  expect(secondBody.audit.id).not.toBe(firstBody.audit.id);

  const firstStoredAfter = await db.costAudit.findUniqueOrThrow({ where: { id: firstBody.audit.id } });
  const secondStored = await db.costAudit.findUniqueOrThrow({ where: { id: secondBody.audit.id } });
  expect(firstStoredAfter.actualCost).toBe(firstStoredBefore.actualCost);
  expect(firstStoredAfter.actualBreakdown).toBe(firstStoredBefore.actualBreakdown);
  expect(firstStoredAfter.analysis).toBe(firstStoredBefore.analysis);
  expect(firstStoredAfter.notes).toBe('primera auditoría sintética');
  expect(secondStored.actualCost).toBe(124);
  expect(JSON.parse(secondStored.actualBreakdown || '{}')).toEqual({ salary: 72, pluses: 11 });
});

test('cada auditoría conserva justificante propio y la descarga nunca cruza documentos', async ({ page }) => {
  const budget = await seedAuditableBudget(`E2E-AUD-DOCS-${Date.now()}`);
  await login(page);
  const firstBytes = Buffer.from('%PDF-justificante-uno');
  const secondBytes = Buffer.from('%PDF-justificante-dos-distinto');

  const first = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId: budget.id,
      actualCost: 120,
      actualBreakdown: { salary: 70 },
      documentName: 'gestoria-uno.pdf',
      documentType: 'application/pdf',
      documentBase64: firstBytes.toString('base64'),
    },
  });
  const second = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId: budget.id,
      actualCost: 121,
      actualBreakdown: { salary: 71 },
      documentName: 'gestoria-dos.pdf',
      documentType: 'application/pdf',
      documentBase64: secondBytes.toString('base64'),
    },
  });
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  const firstId = (JSON.parse(first.text) as { audit: { id: string } }).audit.id;
  const secondId = (JSON.parse(second.text) as { audit: { id: string } }).audit.id;

  const firstDownload = await browserRequest(page, `/api/cost-audits?document=${encodeURIComponent(firstId)}`);
  const secondDownload = await browserRequest(page, `/api/cost-audits?document=${encodeURIComponent(secondId)}`);
  expect(firstDownload.status).toBe(200);
  expect(secondDownload.status).toBe(200);
  expectPrivateNoStore(firstDownload);
  expectPrivateNoStore(secondDownload);
  expect(firstDownload.headers['content-disposition']).toContain('gestoria-uno.pdf');
  expect(secondDownload.headers['content-disposition']).toContain('gestoria-dos.pdf');
  expect(firstDownload.text).toBe(firstBytes.toString());
  expect(secondDownload.text).toBe(secondBytes.toString());
  expect(firstDownload.text).not.toBe(secondDownload.text);
});

test('artefactos de auditorías sucesivas son independientes y enlazan la misma baseline de presupuesto', async ({ page }) => {
  const budget = await seedAuditableBudget(`E2E-AUD-ARTIFACTS-${Date.now()}`);
  await login(page);

  const first = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: { budgetId: budget.id, actualCost: 120, actualBreakdown: { salary: 70 } },
  });
  const second = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: { budgetId: budget.id, actualCost: 122, actualBreakdown: { salary: 71 } },
  });
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  const firstBody = JSON.parse(first.text) as { audit: { id: string }; immutableArtifact: { version: number; artifactHash: string } };
  const secondBody = JSON.parse(second.text) as { audit: { id: string }; immutableArtifact: { version: number; artifactHash: string } };
  expect(firstBody.immutableArtifact.version).toBe(1);
  expect(secondBody.immutableArtifact.version).toBe(1);
  expect(firstBody.immutableArtifact.artifactHash).not.toBe(secondBody.immutableArtifact.artifactHash);

  const baselineRows = await db.budgetHistory.findMany({
    where: { budgetId: budget.id, action: 'sealed_budget_artifact' },
    orderBy: { createdAt: 'asc' },
  });
  expect(baselineRows).toHaveLength(1);
  const baseline = JSON.parse(baselineRows[0].snapshot || '{}') as { artifactHash: string };

  const artifactRows = await db.auditLog.findMany({
    where: {
      action: 'sealed_cost_audit_artifact',
      entity: 'cost_audit',
      entityId: { in: [firstBody.audit.id, secondBody.audit.id] },
    },
  });
  expect(artifactRows).toHaveLength(2);
  const payloads = artifactRows.map((row) => {
    const artifact = JSON.parse(row.newData || '{}') as { artifactHash: string; payloadCanonical: string };
    return {
      hash: artifact.artifactHash,
      payload: JSON.parse(artifact.payloadCanonical) as { auditId: string; originalBudgetArtifactHash: string },
    };
  });
  expect(new Set(payloads.map((item) => item.hash)).size).toBe(2);
  expect(payloads.every((item) => item.payload.originalBudgetArtifactHash === baseline.artifactHash)).toBe(true);
  expect(new Set(payloads.map((item) => item.payload.auditId))).toEqual(new Set([firstBody.audit.id, secondBody.audit.id]));
});

test('historial listado mantiene ambas auditorías tras reload sin sobrescritura ni binarios', async ({ page }) => {
  const budget = await seedAuditableBudget(`E2E-AUD-LIST-TWO-${Date.now()}`);
  await login(page);

  const first = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId: budget.id,
      actualCost: 120,
      actualBreakdown: { salary: 70 },
      notes: 'historial uno',
      documentName: 'uno.pdf',
      documentType: 'application/pdf',
      documentBase64: Buffer.from('%PDF-uno').toString('base64'),
    },
  });
  const second = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId: budget.id,
      actualCost: 121,
      actualBreakdown: { salary: 71 },
      notes: 'historial dos',
      documentName: 'dos.pdf',
      documentType: 'application/pdf',
      documentBase64: Buffer.from('%PDF-dos').toString('base64'),
    },
  });
  const firstId = (JSON.parse(first.text) as { audit: { id: string } }).audit.id;
  const secondId = (JSON.parse(second.text) as { audit: { id: string } }).audit.id;

  await page.reload();
  const listed = await browserRequest(page, '/api/cost-audits');
  expect(listed.status).toBe(200);
  expectPrivateNoStore(listed);
  const audits = (JSON.parse(listed.text) as { audits: Array<Record<string, unknown>> }).audits
    .filter((item) => item.budgetId === budget.id);
  expect(audits).toHaveLength(2);
  expect(new Set(audits.map((item) => item.id))).toEqual(new Set([firstId, secondId]));
  expect(audits.every((item) => item.hasDocument === true)).toBe(true);
  expect(audits.every((item) => !Object.prototype.hasOwnProperty.call(item, 'documentData'))).toBe(true);
  expect(new Set(audits.map((item) => item.notes))).toEqual(new Set(['historial uno', 'historial dos']));
});
