import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

const concepts = {
  productive_hour_gross: { unit: 'EUR/h_productiva', v1: 23, v2: 29 },
  management_fee_per_contract: { unit: 'EUR/contrato', v1: 12, v2: 12 },
  annual_convention_hours: { unit: 'h/año', v1: 1680, v2: 1680 },
  annual_productive_hours: { unit: 'h/año', v1: 1290, v2: 1290 },
  ss_common_contingencies_percent: { unit: '%', v1: 24, v2: 24 },
  ss_unemployment_percent: { unit: '%', v1: 6, v2: 6 },
  ss_fogasa_percent: { unit: '%', v1: 0.2, v2: 0.2 },
  ss_training_percent: { unit: '%', v1: 0.6, v2: 0.6 },
  ss_mei_percent: { unit: '%', v1: 0.8, v2: 0.8 },
  atep_percent: { unit: '%', v1: 1.5, v2: 1.5 },
} as const;

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = {
  totals: { calculationToken: string; totalFinal: number } | null;
  commercial: { status: 'calculated' | 'pending_configuration' };
  issues?: Array<{ field: string; kind: string; message: string }>;
};
type Saved = {
  budget: { id: string; code: string; totalFinal: number };
  immutableArtifact: { version: number; artifactHash: string };
};
type CostAudit = {
  verifiedLaborSources: Array<{ blockIndex: number; sources: Array<{ id: string; label: string; effectiveFrom?: string; effectiveTo?: string }> }>;
};
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
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
    return { status: response.status, body: parsed };
  }, { requestPath: path, requestMethod: method, requestBody: body }) as Promise<ApiResult<T>>;
}

async function login(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(maestroPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function ensureCategory(categoryId: string) {
  await db.professionalCategory.upsert({
    where: { id: categoryId },
    update: { active: true },
    create: {
      id: categoryId,
      name: `E2E Versionada ${categoryId}`,
      description: 'Categoría sintética aislada para regresión de vigencias; no representa costes reales de GASI.',
      defaultPricePerHour: 37,
      defaultInternalCost: 999,
      active: true,
    },
  });
}

async function addVersion(page: Page, categoryId: string, version: 'v1' | 'v2') {
  const effectiveFrom = version === 'v1' ? '2026-01-01' : '2026-07-01';
  const effectiveTo = version === 'v1' ? '2026-06-30' : '2026-12-31';
  const sourceDate = version === 'v1' ? '2026-01-02' : '2026-07-02';
  for (const [conceptKey, config] of Object.entries(concepts)) {
    const response = await api<{ status: string; duplicate?: boolean }>(page, '/api/verified-labor-costs', 'POST', {
      record: {
        id: `${categoryId}:${version}:${conceptKey}`,
        conceptKey,
        categoryId,
        territory: 'Madrid',
        contractType: 'indefinido',
        value: config[version],
        unit: config.unit,
        effectiveFrom,
        effectiveTo,
        sourceDocument: `E2E-GESTORIA-${categoryId}-${version}`,
        sourceDate,
        notes: 'Fixture sintético aislado de regresión histórica; no representa costes reales.',
        status: 'verified',
      },
    });
    expect([200, 201]).toContain(response.status);
    expect(response.body.status).toBe('ok');
  }
}

function professionalBlock(categoryId: string, start: string, end: string, serviceName: string, excludeHolidays = true) {
  return {
    blockType: 'profesional_hora', serviceName, professionalCategory: categoryId,
    puestosSimultaneos: 1, plantillaSeleccionada: 1, pricePerHour: 0,
    contractType: 'indefinido', dateMode: 'range', dateRangeStart: start, dateRangeEnd: end,
    daysOfWeek: [1, 2, 3, 4, 5], excludeSundays: true, excludeHolidays,
    shiftType: 'morning', shiftStartTime: '08:00', shiftEndTime: '16:00', hoursPerDay: 8,
    breakMinutes: 0, unitType: 'hora', quantity: 1, ivaPercent: 21,
  };
}

const madrid = { cc: 'Madrid', province: 'Madrid', municipality: 'Madrid' };

async function calculate(page: Page, block: unknown): Promise<ApiResult<Calculation>> {
  return api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [block], location: madrid, discountPercent: 0, ivaPercent: 21,
  });
}

async function save(page: Page, calculation: Calculation, description: string): Promise<Saved> {
  expect(calculation.commercial.status, JSON.stringify(calculation.issues ?? [])).toBe('calculated');
  expect(calculation.totals?.calculationToken).toBeTruthy();
  const response = await api<Saved>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: calculation.totals!.calculationToken,
    description, status: 'borrador',
  });
  expect(response.status).toBe(201);
  return response.body;
}

function sourceIds(audit: CostAudit) {
  return audit.verifiedLaborSources.flatMap((row) => row.sources.map((source) => source.id));
}

function tokenFrom(url: string) { return new URL(url).pathname.split('/').pop()!; }

async function audit(page: Page, budgetId: string) {
  const response = await api<CostAudit>(page, `/api/costing?budgetId=${encodeURIComponent(budgetId)}`);
  expect(response.status).toBe(200);
  return response.body;
}

test.afterAll(async () => { await db.$disconnect(); });

test('histórico v1 permanece inmutable al incorporar v2: reabrir, PDF y firma conservan presupuesto y fuente v1', async ({ page }) => {
  const categoryId = `e2e-version-history-${Date.now()}-old`;
  await ensureCategory(categoryId);
  await login(page);
  await addVersion(page, categoryId, 'v1');

  const initialResponse = await calculate(page, professionalBlock(categoryId, '2026-05-18', '2026-05-19', 'E2E Histórico V1'));
  expect(initialResponse.status).toBe(200);
  const created = await save(page, initialResponse.body, `Histórico V1 ${categoryId}`);
  const originalTotal = created.budget.totalFinal;
  const originalHash = created.immutableArtifact.artifactHash;

  await addVersion(page, categoryId, 'v2');

  const reopened = await api<{ budgets: Array<{ id: string; totalFinal: number }> }>(page, `/api/budgets?search=${encodeURIComponent(created.budget.code)}`);
  expect(reopened.status).toBe(200);
  expect(reopened.body.budgets.some((row) => row.id === created.budget.id && row.totalFinal === originalTotal)).toBe(true);

  const historicalAudit = await audit(page, created.budget.id);
  expect(sourceIds(historicalAudit)).toContain(`gestoria:${categoryId}:v1:productive_hour_gross`);
  expect(sourceIds(historicalAudit)).not.toContain(`gestoria:${categoryId}:v2:productive_hour_gross`);

  const pdf = await page.evaluate(async (budgetId) => {
    const response = await fetch(`/api/pdf?id=${encodeURIComponent(budgetId)}&mode=client`, { credentials: 'same-origin' });
    return { status: response.status, html: await response.text() };
  }, created.budget.id);
  expect(pdf.status).toBe(200);
  expect(pdf.html).toContain('E2E Histórico V1');
  expect(pdf.html).not.toMatch(/gestoria:|productive_hour_gross|coste interno/i);

  const issued = await api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId: created.budget.id, recipientEmail: 'historico.v1@example.invalid',
  });
  expect(issued.status).toBe(201);
  const accepted = await api<{ status: string }>(page, '/api/public/signature', 'POST', {
    token: tokenFrom(issued.body.signingUrl), signerName: 'Cliente Histórico V1',
    signerEmail: 'historico.v1@example.invalid', signatureData: validPng, consent: true,
  });
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');
  const certificate = await page.evaluate(async (id) => {
    const response = await fetch(`/api/signatures?certificate=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    return { status: response.status, html: await response.text() };
  }, issued.body.id);
  expect(certificate.status).toBe(200);
  expect(certificate.html).toContain(created.budget.code);
  expect(certificate.html).toContain('Certificado de aceptación electrónica');
  expect(originalHash).toHaveLength(64);
});

test('presupuesto nuevo posterior al cambio de vigencia consume exclusivamente v2', async ({ page }) => {
  const categoryId = `e2e-version-history-${Date.now()}-new`;
  await ensureCategory(categoryId);
  await login(page);
  await addVersion(page, categoryId, 'v1');
  await addVersion(page, categoryId, 'v2');

  const response = await calculate(page, professionalBlock(categoryId, '2026-08-17', '2026-08-18', 'E2E Nuevo V2'));
  expect(response.status).toBe(200);
  const created = await save(page, response.body, `Nuevo V2 ${categoryId}`);
  const currentAudit = await audit(page, created.budget.id);
  expect(sourceIds(currentAudit)).toContain(`gestoria:${categoryId}:v2:productive_hour_gross`);
  expect(sourceIds(currentAudit)).not.toContain(`gestoria:${categoryId}:v1:productive_hour_gross`);
});

test('editar y recalcular un presupuesto v1 tras el cambio genera versión 2 con fuentes v2 sin reutilizar snapshot v1', async ({ page }) => {
  const categoryId = `e2e-version-history-${Date.now()}-edit`;
  await ensureCategory(categoryId);
  await login(page);
  await addVersion(page, categoryId, 'v1');

  const v1Response = await calculate(page, professionalBlock(categoryId, '2026-05-25', '2026-05-26', 'E2E Editable V1'));
  expect(v1Response.status).toBe(200);
  const created = await save(page, v1Response.body, `Editable V1 ${categoryId}`);
  const v1Hash = created.immutableArtifact.artifactHash;
  const auditV1 = await audit(page, created.budget.id);
  expect(sourceIds(auditV1)).toContain(`gestoria:${categoryId}:v1:productive_hour_gross`);

  await addVersion(page, categoryId, 'v2');
  const v2Response = await calculate(page, professionalBlock(categoryId, '2026-08-24', '2026-08-25', 'E2E Editable V2'));
  expect(v2Response.status).toBe(200);
  expect(v2Response.body.commercial.status).toBe('calculated');
  const edited = await api<Saved>(page, '/api/budgets', 'PUT', {
    id: created.budget.id,
    calculationToken: v2Response.body.totals!.calculationToken,
    description: `Editable V2 ${categoryId}`,
    serviceBlocks: [],
  });
  expect(edited.status).toBe(200);
  expect(edited.body.immutableArtifact.version).toBe(2);
  expect(edited.body.immutableArtifact.artifactHash).not.toBe(v1Hash);
  const auditV2 = await audit(page, created.budget.id);
  expect(sourceIds(auditV2)).toContain(`gestoria:${categoryId}:v2:productive_hour_gross`);
  expect(sourceIds(auditV2)).not.toContain(`gestoria:${categoryId}:v1:productive_hour_gross`);
});

test('un bloque que cruza v1→v2 se bloquea y no emite total ni calculationToken', async ({ page }) => {
  const categoryId = `e2e-version-history-${Date.now()}-cross`;
  await ensureCategory(categoryId);
  await login(page);
  await addVersion(page, categoryId, 'v1');
  await addVersion(page, categoryId, 'v2');

  const response = await calculate(page, professionalBlock(categoryId, '2026-06-29', '2026-07-02', 'E2E Cruce V1 V2', false));
  expect(response.status).toBe(200);
  expect(response.body.commercial.status).toBe('pending_configuration');
  expect(response.body.totals).toBeNull();
  expect(response.body.issues?.some((issue) => /cruza versiones distintas/i.test(issue.message))).toBe(true);
});
