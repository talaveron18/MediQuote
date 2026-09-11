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
  productive_hour_gross: { unit: 'EUR/h_productiva', value: 23 },
  management_fee_per_contract: { unit: 'EUR/contrato', value: 12 },
  annual_convention_hours: { unit: 'h/año', value: 1680 },
  annual_productive_hours: { unit: 'h/año', value: 1290 },
  ss_common_contingencies_percent: { unit: '%', value: 24 },
  ss_unemployment_percent: { unit: '%', value: 6 },
  ss_fogasa_percent: { unit: '%', value: 0.2 },
  ss_training_percent: { unit: '%', value: 0.6 },
  ss_mei_percent: { unit: '%', value: 0.8 },
  atep_percent: { unit: '%', value: 1.5 },
} as const;

type ConceptKey = keyof typeof concepts;
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
type LaborStore = { records: Array<{ id: string; status: string; supersedesId?: string }> };
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
      name: `E2E Supersesión ${categoryId}`,
      description: 'Categoría sintética aislada para regresión de supersesión; no representa costes reales de GASI.',
      defaultPricePerHour: 37,
      defaultInternalCost: 999,
      active: true,
    },
  });
}

function baselineId(categoryId: string, conceptKey: ConceptKey) {
  return `${categoryId}:baseline:${conceptKey}`;
}

async function addBaseline(page: Page, categoryId: string) {
  for (const [conceptKey, config] of Object.entries(concepts) as Array<[ConceptKey, (typeof concepts)[ConceptKey]]>) {
    const response = await api<{ status: string }>(page, '/api/verified-labor-costs', 'POST', {
      record: {
        id: baselineId(categoryId, conceptKey),
        conceptKey,
        categoryId,
        territory: 'Madrid',
        contractType: 'indefinido',
        value: config.value,
        unit: config.unit,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        sourceDocument: `E2E-GESTORIA-BASE-${categoryId}`,
        sourceDate: '2026-01-02',
        notes: 'Fixture sintético aislado; no representa costes reales.',
        status: 'verified',
      },
    });
    expect([200, 201]).toContain(response.status);
    expect(response.body.status).toBe('ok');
  }
}

async function supersede(page: Page, params: {
  categoryId: string;
  conceptKey?: ConceptKey;
  id?: string;
  status?: 'verified' | 'pending';
  value?: number;
  supersedesId?: string;
  targetCategoryId?: string;
}) {
  const conceptKey = params.conceptKey ?? 'productive_hour_gross';
  const config = concepts[conceptKey];
  const targetCategoryId = params.targetCategoryId ?? params.categoryId;
  return api<{ status: string; issues?: Array<{ field: string; kind: string; message: string }> }>(page, '/api/verified-labor-costs', 'POST', {
    record: {
      id: params.id ?? `${params.categoryId}:successor:${conceptKey}`,
      conceptKey,
      categoryId: targetCategoryId,
      territory: 'Madrid',
      contractType: 'indefinido',
      value: params.value ?? config.value,
      unit: config.unit,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      sourceDocument: `E2E-GESTORIA-SUCCESSOR-${params.id ?? conceptKey}`,
      sourceDate: '2026-09-11',
      notes: 'Fixture sintético de supersesión; no representa costes reales.',
      status: params.status ?? 'pending',
      supersedesId: params.supersedesId ?? baselineId(params.categoryId, conceptKey),
    },
  });
}

function professionalBlock(categoryId: string) {
  return {
    blockType: 'profesional_hora', serviceName: 'E2E Supersesión', professionalCategory: categoryId,
    puestosSimultaneos: 1, plantillaSeleccionada: 1, pricePerHour: 0,
    contractType: 'indefinido', dateMode: 'range', dateRangeStart: '2026-09-21', dateRangeEnd: '2026-09-22',
    daysOfWeek: [1, 2, 3, 4, 5], excludeSundays: true, excludeHolidays: true,
    shiftType: 'morning', shiftStartTime: '08:00', shiftEndTime: '16:00', hoursPerDay: 8,
    breakMinutes: 0, unitType: 'hora', quantity: 1, ivaPercent: 21,
  };
}

const madrid = { cc: 'Madrid', province: 'Madrid', municipality: 'Madrid' };

async function calculate(page: Page, categoryId: string): Promise<ApiResult<Calculation>> {
  return api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [professionalBlock(categoryId)], location: madrid, discountPercent: 0, ivaPercent: 21,
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

async function audit(page: Page, budgetId: string) {
  const response = await api<CostAudit>(page, `/api/costing?budgetId=${encodeURIComponent(budgetId)}`);
  expect(response.status).toBe(200);
  return response.body;
}

function sourceIds(auditResult: CostAudit) {
  return auditResult.verifiedLaborSources.flatMap((row) => row.sources.map((source) => source.id));
}

function tokenFrom(url: string) { return new URL(url).pathname.split('/').pop()!; }

test.afterAll(async () => { await db.$disconnect(); });

test('una invalidación append-only pending conserva la fuente original pero bloquea cálculos nuevos', async ({ page }) => {
  const categoryId = `e2e-supersession-${Date.now()}-pending`;
  await ensureCategory(categoryId);
  await login(page);
  await addBaseline(page, categoryId);

  const before = await calculate(page, categoryId);
  expect(before.status).toBe(200);
  expect(before.body.commercial.status).toBe('calculated');

  const invalidation = await supersede(page, { categoryId, id: `${categoryId}:invalidation`, status: 'pending' });
  expect(invalidation.status).toBe(201);
  expect(invalidation.body.status).toBe('ok');

  const store = await api<LaborStore>(page, '/api/verified-labor-costs');
  expect(store.status).toBe(200);
  const original = store.body.records.find((row) => row.id === baselineId(categoryId, 'productive_hour_gross'));
  const successor = store.body.records.find((row) => row.id === `${categoryId}:invalidation`);
  expect(original?.status).toBe('verified');
  expect(successor?.status).toBe('pending');
  expect(successor?.supersedesId).toBe(original?.id);

  const after = await calculate(page, categoryId);
  expect(after.status).toBe(200);
  expect(after.body.commercial.status).toBe('pending_configuration');
  expect(after.body.totals).toBeNull();
  expect(after.body.issues?.some((issue) => issue.field.includes('productive_hour_gross'))).toBe(true);
});

test('presupuesto ya guardado sigue reproducible, PDF y firma operativos tras invalidar su fuente', async ({ page }) => {
  const categoryId = `e2e-supersession-${Date.now()}-historic`;
  await ensureCategory(categoryId);
  await login(page);
  await addBaseline(page, categoryId);

  const calculation = await calculate(page, categoryId);
  expect(calculation.status).toBe(200);
  const created = await save(page, calculation.body, `Histórico supersesión ${categoryId}`);
  const originalTotal = created.budget.totalFinal;
  const originalHash = created.immutableArtifact.artifactHash;
  const beforeAudit = await audit(page, created.budget.id);
  expect(sourceIds(beforeAudit)).toContain(`gestoria:${baselineId(categoryId, 'productive_hour_gross')}`);

  const invalidation = await supersede(page, { categoryId, id: `${categoryId}:historic-invalidation`, status: 'pending' });
  expect(invalidation.status).toBe(201);

  const reopened = await api<{ budgets: Array<{ id: string; totalFinal: number }> }>(page, `/api/budgets?search=${encodeURIComponent(created.budget.code)}`);
  expect(reopened.status).toBe(200);
  expect(reopened.body.budgets.some((row) => row.id === created.budget.id && row.totalFinal === originalTotal)).toBe(true);
  const historicalAudit = await audit(page, created.budget.id);
  expect(sourceIds(historicalAudit)).toContain(`gestoria:${baselineId(categoryId, 'productive_hour_gross')}`);

  const pdf = await page.evaluate(async (budgetId) => {
    const response = await fetch(`/api/pdf?id=${encodeURIComponent(budgetId)}&mode=client`, { credentials: 'same-origin' });
    return { status: response.status, html: await response.text() };
  }, created.budget.id);
  expect(pdf.status).toBe(200);
  expect(pdf.html).toContain('Histórico supersesión');
  expect(pdf.html).not.toMatch(/gestoria:|productive_hour_gross|coste interno/i);

  const issued = await api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId: created.budget.id, recipientEmail: 'historic.supersession@example.invalid',
  });
  expect(issued.status).toBe(201);
  const accepted = await api<{ status: string }>(page, '/api/public/signature', 'POST', {
    token: tokenFrom(issued.body.signingUrl), signerName: 'Cliente Histórico Supersesión',
    signerEmail: 'historic.supersession@example.invalid', signatureData: validPng, consent: true,
  });
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');
  const certificate = await page.evaluate(async (id) => {
    const response = await fetch(`/api/signatures?certificate=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    return { status: response.status, html: await response.text() };
  }, issued.body.id);
  expect(certificate.status).toBe(200);
  expect(certificate.html).toContain(created.budget.code);
  expect(originalHash).toHaveLength(64);
});

test('una sucesora verified sustituye v1 para cálculos nuevos sin contaminar el histórico almacenado', async ({ page }) => {
  const categoryId = `e2e-supersession-${Date.now()}-replacement`;
  await ensureCategory(categoryId);
  await login(page);
  await addBaseline(page, categoryId);

  const replacementId = `${categoryId}:replacement`;
  const replacement = await supersede(page, {
    categoryId, id: replacementId, status: 'verified', value: 29,
  });
  expect(replacement.status).toBe(201);

  const calculation = await calculate(page, categoryId);
  expect(calculation.status).toBe(200);
  expect(calculation.body.commercial.status).toBe('calculated');
  const created = await save(page, calculation.body, `Nuevo tras supersesión ${categoryId}`);
  const currentAudit = await audit(page, created.budget.id);
  expect(sourceIds(currentAudit)).toContain(`gestoria:${replacementId}`);
  expect(sourceIds(currentAudit)).not.toContain(`gestoria:${baselineId(categoryId, 'productive_hour_gross')}`);
});

test('supersesiones cruzadas o ramificadas se rechazan y no alteran el linaje válido', async ({ page }) => {
  const categoryId = `e2e-supersession-${Date.now()}-guards`;
  const otherCategory = `${categoryId}-other`;
  await ensureCategory(categoryId);
  await ensureCategory(otherCategory);
  await login(page);
  await addBaseline(page, categoryId);

  const cross = await supersede(page, {
    categoryId, targetCategoryId: otherCategory, id: `${categoryId}:cross-scope`, status: 'pending',
  });
  expect(cross.status).toBe(422);
  expect(cross.body.status).toBe('invalid');
  expect(cross.body.issues?.some((issue) => issue.kind === 'blocked')).toBe(true);

  const legitimateId = `${categoryId}:legitimate-invalidation`;
  const legitimate = await supersede(page, { categoryId, id: legitimateId, status: 'pending' });
  expect(legitimate.status).toBe(201);

  const branch = await supersede(page, {
    categoryId, id: `${categoryId}:branch`, status: 'verified', value: 29,
  });
  expect(branch.status).toBe(409);
  expect(branch.body.status).toBe('conflict');
  expect(branch.body.issues?.some((issue) => /segunda rama/i.test(issue.message))).toBe(true);

  const store = await api<LaborStore>(page, '/api/verified-labor-costs');
  expect(store.status).toBe(200);
  expect(store.body.records.some((row) => row.id === `${categoryId}:cross-scope`)).toBe(false);
  expect(store.body.records.some((row) => row.id === `${categoryId}:branch`)).toBe(false);
  expect(store.body.records.find((row) => row.id === legitimateId)?.supersedesId).toBe(baselineId(categoryId, 'productive_hour_gross'));

  const calculation = await calculate(page, categoryId);
  expect(calculation.body.commercial.status).toBe('pending_configuration');
  expect(calculation.body.totals).toBeNull();
});
