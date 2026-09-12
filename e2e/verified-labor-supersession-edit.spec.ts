import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
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
type Saved = { budget: { id: string; code: string; totalFinal: number }; immutableArtifact: { version: number; artifactHash: string } };
type CostAudit = { verifiedLaborSources: Array<{ sources: Array<{ id: string }> }> };

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
    where: { id: categoryId }, update: { active: true },
    create: {
      id: categoryId, name: `E2E Edit supersesión ${categoryId}`,
      description: 'Categoría sintética aislada; no representa costes reales de GASI.',
      defaultPricePerHour: 37, defaultInternalCost: 999, active: true,
    },
  });
}

function baselineId(categoryId: string, conceptKey: ConceptKey) { return `${categoryId}:baseline:${conceptKey}`; }

async function addBaseline(page: Page, categoryId: string) {
  for (const [conceptKey, config] of Object.entries(concepts) as Array<[ConceptKey, (typeof concepts)[ConceptKey]]>) {
    const result = await api<{ status: string }>(page, '/api/verified-labor-costs', 'POST', { record: {
      id: baselineId(categoryId, conceptKey), conceptKey, categoryId, territory: 'Madrid', contractType: 'indefinido',
      value: config.value, unit: config.unit, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
      sourceDocument: `E2E-EDIT-BASE-${categoryId}`, sourceDate: '2026-01-02',
      notes: 'Fixture sintético aislado; no representa costes reales.', status: 'verified',
    } });
    expect([200, 201]).toContain(result.status);
  }
}

async function supersede(page: Page, categoryId: string, status: 'verified' | 'pending', value = 29) {
  const id = `${categoryId}:successor:${status}`;
  const result = await api<{ status: string }>(page, '/api/verified-labor-costs', 'POST', { record: {
    id, conceptKey: 'productive_hour_gross', categoryId, territory: 'Madrid', contractType: 'indefinido',
    value, unit: 'EUR/h_productiva', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
    sourceDocument: `E2E-EDIT-SUCCESSOR-${categoryId}`, sourceDate: '2026-09-11',
    notes: 'Fixture sintético de supersesión; no representa costes reales.', status,
    supersedesId: baselineId(categoryId, 'productive_hour_gross'),
  } });
  expect(result.status).toBe(201);
  return id;
}

function block(categoryId: string) {
  return {
    blockType: 'profesional_hora', serviceName: 'E2E Edición supersesión', professionalCategory: categoryId,
    puestosSimultaneos: 1, plantillaSeleccionada: 1, pricePerHour: 0, contractType: 'indefinido',
    dateMode: 'range', dateRangeStart: '2026-09-21', dateRangeEnd: '2026-09-22', daysOfWeek: [1, 2, 3, 4, 5],
    excludeSundays: true, excludeHolidays: true, shiftType: 'morning', shiftStartTime: '08:00', shiftEndTime: '16:00',
    hoursPerDay: 8, breakMinutes: 0, unitType: 'hora', quantity: 1, ivaPercent: 21,
  };
}

async function calculate(page: Page, categoryId: string) {
  return api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [block(categoryId)], location: { cc: 'Madrid', province: 'Madrid', municipality: 'Madrid' }, discountPercent: 0, ivaPercent: 21,
  });
}

async function save(page: Page, calculation: Calculation, description: string) {
  expect(calculation.commercial.status, JSON.stringify(calculation.issues ?? [])).toBe('calculated');
  const result = await api<Saved>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: calculation.totals!.calculationToken, description, status: 'borrador',
  });
  expect(result.status).toBe(201);
  return result.body;
}

async function sourceIds(page: Page, budgetId: string) {
  const result = await api<CostAudit>(page, `/api/costing?budgetId=${encodeURIComponent(budgetId)}`);
  expect(result.status).toBe(200);
  return result.body.verifiedLaborSources.flatMap((row) => row.sources.map((source) => source.id));
}

function unique(label: string) { return `e2e-sup-edit-${Date.now()}-${Math.random().toString(36).slice(2)}-${label}`; }

test.afterAll(async () => { await db.$disconnect(); });

test('editar/recalcular tras sucesora pending falla cerrado y no reutiliza la fuente histórica', async ({ page }) => {
  const categoryId = unique('pending');
  await ensureCategory(categoryId); await login(page); await addBaseline(page, categoryId);
  const initial = await calculate(page, categoryId); expect(initial.status).toBe(200);
  const created = await save(page, initial.body, `V1 pending ${categoryId}`);
  const oldTotal = created.budget.totalFinal;
  await supersede(page, categoryId, 'pending');

  const recalculation = await calculate(page, categoryId);
  expect(recalculation.status).toBe(200);
  expect(recalculation.body.commercial.status).toBe('pending_configuration');
  expect(recalculation.body.totals).toBeNull();
  const edit = await api(page, '/api/budgets', 'PUT', { id: created.budget.id, serviceBlocks: [], description: 'NO_DEBE_APLICARSE' });
  expect(edit.status).toBe(409);

  const reopened = await api<{ budgets: Array<{ id: string; description: string; totalFinal: number }> }>(page, `/api/budgets?id=${created.budget.id}`);
  expect(reopened.status).toBe(200);
  expect(reopened.body.budgets[0].totalFinal).toBe(oldTotal);
  expect(reopened.body.budgets[0].description).toBe(`V1 pending ${categoryId}`);
  expect(await sourceIds(page, created.budget.id)).toContain(`gestoria:${baselineId(categoryId, 'productive_hour_gross')}`);
});

test('editar/recalcular con sucesora verified crea v2 usando solo la reemplazante', async ({ page }) => {
  const categoryId = unique('verified');
  await ensureCategory(categoryId); await login(page); await addBaseline(page, categoryId);
  const initial = await calculate(page, categoryId); const created = await save(page, initial.body, `V1 verified ${categoryId}`);
  const v1Hash = created.immutableArtifact.artifactHash;
  const replacementId = await supersede(page, categoryId, 'verified', 29);
  const recalculation = await calculate(page, categoryId);
  expect(recalculation.body.commercial.status).toBe('calculated');

  const edited = await api<Saved>(page, '/api/budgets', 'PUT', {
    id: created.budget.id, serviceBlocks: [], description: `V2 verified ${categoryId}`,
    calculationToken: recalculation.body.totals!.calculationToken,
  });
  expect(edited.status).toBe(200);
  expect(edited.body.immutableArtifact.version).toBe(2);
  expect(edited.body.immutableArtifact.artifactHash).not.toBe(v1Hash);
  const ids = await sourceIds(page, created.budget.id);
  expect(ids).toContain(`gestoria:${replacementId}`);
  expect(ids).not.toContain(`gestoria:${baselineId(categoryId, 'productive_hour_gross')}`);
});

test('un enlace de firma pendiente anterior a una edición económica se normaliza como revocado', async ({ page }) => {
  const categoryId = unique('signature');
  await ensureCategory(categoryId); await login(page); await addBaseline(page, categoryId);
  const initial = await calculate(page, categoryId); const created = await save(page, initial.body, `V1 firma ${categoryId}`);
  const signature = await api<{ id: string; signingUrl: string }>(page, '/api/signatures', 'POST', {
    budgetId: created.budget.id, recipientEmail: 'stale.signature@example.invalid',
  });
  expect(signature.status).toBe(201);
  const replacementId = await supersede(page, categoryId, 'verified', 29);
  expect(replacementId).toBeTruthy();
  const recalculation = await calculate(page, categoryId);
  const edited = await api<Saved>(page, '/api/budgets', 'PUT', {
    id: created.budget.id, serviceBlocks: [], description: `V2 firma ${categoryId}`,
    calculationToken: recalculation.body.totals!.calculationToken,
  });
  expect(edited.status).toBe(200);

  const staleToken = new URL(signature.body.signingUrl).pathname.split('/').filter(Boolean).pop()!;
  const publicReview = await api(page, `/api/public/signature?token=${encodeURIComponent(staleToken)}`);
  expect(publicReview.status).toBe(409);
  const list = await api<{ requests: Array<{ id: string; status: string }> }>(page, `/api/signatures?budgetId=${created.budget.id}`);
  expect(list.status).toBe(200);
  expect(list.body.requests.find((row) => row.id === signature.body.id)?.status).toBe('revoked');
});

test('doble guardado concurrente de la misma recalculación deja una única v2', async ({ page }) => {
  const categoryId = unique('concurrency');
  await ensureCategory(categoryId); await login(page); await addBaseline(page, categoryId);
  const initial = await calculate(page, categoryId); const created = await save(page, initial.body, `V1 concurrente ${categoryId}`);
  const replacementId = await supersede(page, categoryId, 'verified', 29);
  const recalculation = await calculate(page, categoryId);
  const body = { id: created.budget.id, serviceBlocks: [], description: `V2 concurrente ${categoryId}`, calculationToken: recalculation.body.totals!.calculationToken };

  const responses = await page.evaluate(async (payload) => {
    const send = async () => {
      const response = await fetch('/api/budgets', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      let body: unknown = null; try { body = await response.json(); } catch { /* ignore */ }
      return { status: response.status, body };
    };
    return Promise.all([send(), send()]);
  }, body);
  expect(responses.map((row) => row.status).sort()).toEqual([200, 409]);
  const winner = responses.find((row) => row.status === 200)!.body as Saved;
  expect(winner.immutableArtifact.version).toBe(2);
  const ids = await sourceIds(page, created.budget.id);
  expect(ids).toContain(`gestoria:${replacementId}`);
  expect(ids).not.toContain(`gestoria:${baselineId(categoryId, 'productive_hour_gross')}`);
});
