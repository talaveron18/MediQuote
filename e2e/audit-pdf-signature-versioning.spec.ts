import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

const adminPassword = (() => {
  const value = process.env.E2E_ADMIN_PASSWORD;
  if (!value) throw new Error('E2E_ADMIN_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const validSignatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = { status: number; body: T };
type ImmutableArtifact = { version: number; artifactHash: string };

async function api<T = unknown>(page: Page, path: string, options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<ApiResult<T>> {
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
      try { body = JSON.parse(text); } catch { /* HTML document */ }
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

function snapshot(label: string, totalInternalCost: number, price: number) {
  return {
    internalCost: {
      totalInternalCost,
      laborBlocks: [{ labor: { salaryForService: totalInternalCost - 20, totalPluses: 5, totalEmployerContributions: 10, totalOccupationalRisk: 5 }, managementCost: 0, terminationProvision: 0, otherContractCosts: 0, overhead: 0 }],
      directCostTotal: 0,
      directCostOverhead: 0,
    },
    commercial: { commissionAmount: 3, finalGasiBenefit: 5 },
    serviceBlocks: [{
      serviceName: label,
      professionalCategory: 'Enfermería', puestosSimultaneos: 1, pricePerHour: price, internalCostPerHour: totalInternalCost / 8,
      dateMode: 'specific', specificDates: ['2026-10-20'], shiftType: 'custom', shiftStartTime: '08:00', shiftEndTime: '16:00',
      hoursPerDay: 8, quantity: 1, blockType: 'profesional_hora', unitType: 'hora', plantillaSeleccionada: 1, ivaPercent: 21,
    }],
    schedules: [{ totalWorkingDays: 1, totalHours: 8, coverageHours: 8, totalSurcharges: 0, minProfessionals: 1, overtimeHours: 0, subtotal: price, initialPriceExVat: price, totalWithSurcharges: price, closingPriceExVat: price, discountAmount: 0, ivaAmount: price * 0.21, totalWithVat: price * 1.21, surcharges: [], laborWarnings: [] }],
    location: { id: 'ine-280796', cc: 'Madrid', province: 'Madrid', municipality: 'Madrid' },
  };
}

async function seedBudget(code: string) {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'e2e.admin@example.invalid' } });
  const budget = await db.budget.create({ data: { code, clientId: 'e2e-client-001', createdById: admin.id, description: 'VERSION_V1_AUDITADA', subtotal: 150, totalFinal: 181.5, ivaPercent: 21, ivaAmount: 31.5 } });
  await db.costingQuote.create({ data: { userId: admin.id, budgetId: budget.id, snapshot: JSON.stringify(snapshot('SERVICIO_VERSION_V1', 120, 150)), subtotal: 150, discountPercent: 0, discountAmount: 0, ivaPercent: 21, ivaAmount: 31.5, totalFinal: 181.5, expiresAt: new Date(Date.now() + 60_000), usedAt: new Date(Date.now() - 2_000) } });
  return { admin, budget };
}

async function audit(page: Page, budgetId: string, actualCost: number) {
  const response = await api<{ audit: { id: string } }>(page, '/api/cost-audits', { method: 'POST', body: { budgetId, actualCost, actualBreakdown: { salary: actualCost - 20, pluses: 5 } } });
  expect(response.status).toBe(201);
  const id = response.body.audit.id;
  const log = await db.auditLog.findFirstOrThrow({ where: { action: 'sealed_cost_audit_artifact', entity: 'cost_audit', entityId: id }, orderBy: { createdAt: 'desc' } });
  const artifact = JSON.parse(log.newData || '{}') as { artifactHash: string; payloadCanonical: string };
  const payload = JSON.parse(artifact.payloadCanonical) as { originalBudgetArtifactHash: string };
  return { id, artifactHash: artifact.artifactHash, baselineHash: payload.originalBudgetArtifactHash, raw: log.newData };
}

async function editToV2(page: Page, userId: string, budgetId: string): Promise<ImmutableArtifact> {
  const quote = await db.costingQuote.create({ data: { userId, snapshot: JSON.stringify(snapshot('SERVICIO_VERSION_V2_VIGENTE', 140, 200)), subtotal: 200, discountPercent: 0, discountAmount: 0, ivaPercent: 21, ivaAmount: 42, totalFinal: 242, expiresAt: new Date(Date.now() + 60_000) } });
  const response = await api<{ immutableArtifact: ImmutableArtifact }>(page, '/api/budgets', { method: 'PUT', body: { id: budgetId, description: 'VERSION_V2_VIGENTE', serviceBlocks: [], calculationToken: quote.id } });
  expect(response.status).toBe(200);
  expect(response.body.immutableArtifact.version).toBe(2);
  return response.body.immutableArtifact;
}

async function prepared(page: Page, code: string) {
  const { admin, budget } = await seedBudget(code);
  await login(page);
  const firstAudit = await audit(page, budget.id, 120);
  const v2 = await editToV2(page, admin.id, budget.id);
  expect(v2.artifactHash).not.toBe(firstAudit.baselineHash);
  return { budget, firstAudit, v2 };
}

async function assertFirstAuditUnchanged(firstAudit: { id: string; raw: string | null; baselineHash: string }) {
  const log = await db.auditLog.findFirstOrThrow({ where: { action: 'sealed_cost_audit_artifact', entity: 'cost_audit', entityId: firstAudit.id }, orderBy: { createdAt: 'desc' } });
  expect(log.newData).toBe(firstAudit.raw);
  const artifact = JSON.parse(log.newData || '{}') as { payloadCanonical: string };
  const payload = JSON.parse(artifact.payloadCanonical) as { originalBudgetArtifactHash: string };
  expect(payload.originalBudgetArtifactHash).toBe(firstAudit.baselineHash);
}

test.afterAll(async () => { await db.$disconnect(); });

test('PDF cliente usa v2 vigente mientras la auditoría histórica sigue anclada a v1', async ({ page }) => {
  const { budget, firstAudit } = await prepared(page, `E2E-DOC-CLIENT-VERSION-${Date.now()}`);
  const doc = await api<string>(page, `/api/pdf?id=${budget.id}&mode=client`);
  expect(doc.status).toBe(200);
  expect(String(doc.body)).toContain('SERVICIO_VERSION_V2_VIGENTE');
  expect(String(doc.body)).not.toContain('SERVICIO_VERSION_V1');
  await assertFirstAuditUnchanged(firstAudit);
});

test('PDF comercial usa v2 vigente sin reanclar ni alterar la auditoría v1', async ({ page }) => {
  const { budget, firstAudit } = await prepared(page, `E2E-DOC-COMMERCIAL-VERSION-${Date.now()}`);
  const doc = await api<string>(page, `/api/pdf?id=${budget.id}&mode=commercial`);
  expect(doc.status).toBe(200);
  expect(String(doc.body)).toContain('SERVICIO_VERSION_V2_VIGENTE');
  expect(String(doc.body)).not.toContain('SERVICIO_VERSION_V1');
  await assertFirstAuditUnchanged(firstAudit);
});

test('firma creada después de v2 revisa y acepta la versión vigente sin tocar auditoría v1', async ({ page }) => {
  const { budget, firstAudit } = await prepared(page, `E2E-SIGN-VERSION-${Date.now()}`);
  const signerEmail = 'cliente.versionado@example.invalid';
  const created = await api<{ id: string; signingUrl: string }>(page, '/api/signatures', { method: 'POST', body: { budgetId: budget.id, recipientEmail: signerEmail } });
  expect(created.status).toBe(201);
  const token = new URL(created.body.signingUrl).pathname.split('/').filter(Boolean).pop();
  expect(token).toBeTruthy();
  const review = await api<{ status: string; budget: { description: string; serviceBlocks: Array<{ serviceName: string }> } }>(page, `/api/public/signature?token=${encodeURIComponent(token!)}`);
  expect(review.status).toBe(200);
  expect(review.body.budget.description).toBe('VERSION_V2_VIGENTE');
  expect(review.body.budget.serviceBlocks.map((item) => item.serviceName)).toContain('SERVICIO_VERSION_V2_VIGENTE');
  const accepted = await api<{ status: string }>(page, '/api/public/signature', { method: 'POST', body: { token, signerEmail, signerName: 'Cliente Versionado E2E', signatureData: validSignatureData, consent: true } });
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');
  await assertFirstAuditUnchanged(firstAudit);
});

test('auditoría posterior a PDF/firma de v2 se ancla a v2 y conserva separada la auditoría v1', async ({ page }) => {
  const { budget, firstAudit, v2 } = await prepared(page, `E2E-AUDIT-AFTER-DOCS-${Date.now()}`);
  const clientDoc = await api<string>(page, `/api/pdf?id=${budget.id}&mode=client`);
  expect(clientDoc.status).toBe(200);
  const signature = await api<{ signingUrl: string }>(page, '/api/signatures', { method: 'POST', body: { budgetId: budget.id, recipientEmail: 'cliente.postaudit@example.invalid' } });
  expect(signature.status).toBe(201);
  const secondAudit = await audit(page, budget.id, 140);
  expect(secondAudit.baselineHash).toBe(v2.artifactHash);
  expect(secondAudit.baselineHash).not.toBe(firstAudit.baselineHash);
  expect(secondAudit.artifactHash).not.toBe(firstAudit.artifactHash);
  await assertFirstAuditUnchanged(firstAudit);
});
