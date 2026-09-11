import { expect, test, type Page } from '@playwright/test';

const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = {
  totals: { calculationToken: string; totalFinal: number } | null;
  commercial: { status: 'calculated' | 'pending_configuration' };
  internalCost?: { totalInternalCost: number; laborBlocks: unknown[] };
  issues?: Array<{ field: string; kind: string; message: string }>;
};
type Saved = {
  budget: { id: string; code: string; status: string; totalFinal: number; description?: string | null };
  immutableArtifact: { version: number; artifactHash: string };
};
type CostAudit = {
  budget: { id: string; code: string; totalFinal: number };
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

function professionalBlock(name: string, category: string, contractType: 'indefinido' | 'temporal', start: string, end: string, positions = 1) {
  return {
    blockType: 'profesional_hora', serviceName: name, professionalCategory: category,
    puestosSimultaneos: positions, plantillaSeleccionada: positions, pricePerHour: 0,
    contractType, dateMode: 'range', dateRangeStart: start, dateRangeEnd: end,
    daysOfWeek: [1, 2, 3, 4, 5], excludeSundays: true, excludeHolidays: true,
    shiftType: 'morning', shiftStartTime: '08:00', shiftEndTime: '16:00', hoursPerDay: 8,
    breakMinutes: 0, unitType: 'hora', quantity: 1, ivaPercent: 21,
  };
}

const madrid = { cc: 'Madrid', province: 'Madrid', municipality: 'Madrid' };

async function calculate(page: Page, blocks: unknown[]): Promise<Calculation> {
  const response = await api<Calculation>(page, '/api/calculations', 'POST', {
    blocks, location: madrid, discountPercent: 0, ivaPercent: 21,
  });
  expect(response.status).toBe(200);
  expect(response.body.commercial.status, JSON.stringify(response.body.issues ?? [])).toBe('calculated');
  expect(response.body.totals?.calculationToken).toBeTruthy();
  return response.body;
}

function tokenFrom(url: string) {
  return new URL(url).pathname.split('/').pop()!;
}

test('verified profesional · calcular → guardar → reabrir → editar → PDF → firma conserva fuentes exactas de gestoría', async ({ page }) => {
  await login(page);
  const originalBlocks = [
    professionalBlock('E2E Enfermería verified', 'e2e-category-nursing', 'indefinido', '2026-09-14', '2026-09-15', 2),
    professionalBlock('E2E Medicina verified', 'e2e-category-medicine', 'temporal', '2026-09-16', '2026-09-16'),
  ];
  const initial = await calculate(page, originalBlocks);
  expect(initial.internalCost?.laborBlocks).toHaveLength(2);

  const marker = `E2E profesional verified ${Date.now()}`;
  const created = await api<Saved>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: initial.totals!.calculationToken,
    description: marker, status: 'borrador',
  });
  expect(created.status).toBe(201);
  expect(created.body.budget.totalFinal).toBe(initial.totals!.totalFinal);
  expect(created.body.immutableArtifact.version).toBe(1);

  const reopened = await api<{ budgets: Array<{ id: string; code: string; description: string; totalFinal: number }> }>(
    page, `/api/budgets?search=${encodeURIComponent(created.body.budget.code)}`,
  );
  expect(reopened.status).toBe(200);
  expect(reopened.body.budgets.some((row) => row.id === created.body.budget.id && row.totalFinal === initial.totals!.totalFinal)).toBe(true);

  const auditV1 = await api<CostAudit>(page, `/api/costing?budgetId=${created.body.budget.id}`);
  expect(auditV1.status).toBe(200);
  expect(auditV1.body.verifiedLaborSources).toHaveLength(2);
  const idsV1 = auditV1.body.verifiedLaborSources.flatMap((row) => row.sources.map((source) => source.id));
  expect(idsV1.some((id) => id === 'gestoria:e2e:e2e-category-nursing:Madrid:indefinido:productive_hour_gross')).toBe(true);
  expect(idsV1.some((id) => id === 'gestoria:e2e:e2e-category-medicine:Madrid:temporal:productive_hour_gross')).toBe(true);
  for (const item of auditV1.body.verifiedLaborSources.flatMap((row) => row.sources)) {
    expect(item.effectiveFrom).toBe('2026-01-01');
    expect(item.effectiveTo).toBe('2026-12-31');
  }

  const editedBlocks = [
    professionalBlock('E2E Medicina verified editada', 'e2e-category-medicine', 'indefinido', '2026-09-21', '2026-09-22', 2),
  ];
  const editedCalculation = await calculate(page, editedBlocks);
  const edited = await api<Saved>(page, '/api/budgets', 'PUT', {
    id: created.body.budget.id, calculationToken: editedCalculation.totals!.calculationToken,
    description: `${marker} editado`, serviceBlocks: [],
  });
  expect(edited.status).toBe(200);
  expect(edited.body.immutableArtifact.version).toBe(2);
  expect(edited.body.immutableArtifact.artifactHash).not.toBe(created.body.immutableArtifact.artifactHash);
  expect(edited.body.budget.totalFinal).toBe(editedCalculation.totals!.totalFinal);

  const auditV2 = await api<CostAudit>(page, `/api/costing?budgetId=${created.body.budget.id}`);
  expect(auditV2.status).toBe(200);
  const idsV2 = auditV2.body.verifiedLaborSources.flatMap((row) => row.sources.map((source) => source.id));
  expect(idsV2.some((id) => id === 'gestoria:e2e:e2e-category-medicine:Madrid:indefinido:productive_hour_gross')).toBe(true);
  expect(idsV2.some((id) => id.includes('e2e-category-nursing'))).toBe(false);

  const pdf = await page.evaluate(async (budgetId) => {
    const response = await fetch(`/api/pdf?id=${encodeURIComponent(budgetId)}&mode=client`, { credentials: 'same-origin' });
    return { status: response.status, html: await response.text() };
  }, created.body.budget.id);
  expect(pdf.status).toBe(200);
  expect(pdf.html).toContain('E2E Medicina verified editada');
  expect(pdf.html).not.toContain('E2E Enfermería verified');
  expect(pdf.html).not.toMatch(/productive_hour_gross|gestoria:e2e|coste interno|margen interno/i);

  const issued = await api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId: created.body.budget.id, recipientEmail: 'cliente.profesional@example.invalid',
  });
  expect(issued.status).toBe(201);
  const accepted = await api<{ status: string }>(page, '/api/public/signature', 'POST', {
    token: tokenFrom(issued.body.signingUrl), signerName: 'Cliente Profesional E2E',
    signerEmail: 'cliente.profesional@example.invalid', signatureData: validPng, consent: true,
  });
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');

  const certificate = await page.evaluate(async (id) => {
    const response = await fetch(`/api/signatures?certificate=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    return { status: response.status, html: await response.text() };
  }, issued.body.id);
  expect(certificate.status).toBe(200);
  expect(certificate.html).toContain('Certificado de aceptación electrónica');
  expect(certificate.html).toContain(edited.body.budget.code);
});
