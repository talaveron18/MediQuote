import { expect, test, type Page } from '@playwright/test';

const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();
const nursingCategory = 'e2e-category-nursing';
const medicineCategory = 'e2e-category-medicine';
const validSignatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = {
  blocks: Array<{ blockIndex: number; category: string; totalWithVat: number }>;
  totals: { subtotal: number; discountAmount: number; ivaAmount: number; totalFinal: number; calculationToken: string };
  commercial: { status: string };
};
type ImmutableArtifact = { version: number; artifactHash: string };
type CreatedBudget = { budget: { id: string; code: string; status: string }; immutableArtifact: ImmutableArtifact };
type UpdatedBudget = { budget: ReopenedBudget; immutableArtifact: ImmutableArtifact };
type ReopenedBudget = { id: string; code: string; status: string; serviceBlocks: Array<{ serviceName: string; professionalCategory?: string; sortOrder?: number }>; totalFinal: number };
type SignatureCreated = { id: string; signingUrl: string; mailtoUrl: string };
type SignatureList = { requests: Array<{ id: string; status: string }> };

async function api<T = unknown>(page: Page, path: string, options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<ApiResult<T>> {
  return page.evaluate(async ({ requestPath, method, requestBody }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      headers: requestBody === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { status: response.status, body };
  }, { requestPath: path, method: options.method ?? 'GET', requestBody: options.body }) as Promise<ApiResult<T>>;
}

async function login(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(maestroPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

function block(label: string, category: string, date: string, shiftType: string, fixedPrice: number, sortOrder: number) {
  return {
    blockType: 'material', serviceName: label, professionalCategory: category, dateMode: 'range',
    dateRangeStart: date, dateRangeEnd: date, shiftType, hoursPerDay: 8,
    unitType: 'unidad', quantity: 1, pricePerHour: fixedPrice, fixedPrice, ivaPercent: 21, sortOrder,
  };
}

async function calculate(page: Page, blocks: unknown[]) {
  const result = await api<Calculation>(page, '/api/calculations', {
    method: 'POST', body: { blocks, discountPercent: 0, ivaPercent: 21 },
  });
  expect(result.status).toBe(200);
  expect(result.body.commercial.status).toBe('calculated');
  expect(result.body.totals.calculationToken).toBeTruthy();
  return result.body;
}

async function createBudget(page: Page, calculation: Calculation, marker: string) {
  const result = await api<CreatedBudget>(page, '/api/budgets', {
    method: 'POST',
    body: { clientId: 'e2e-client-001', calculationToken: calculation.totals.calculationToken, description: marker, status: 'borrador' },
  });
  expect(result.status).toBe(201);
  expect(result.body.immutableArtifact.version).toBe(1);
  expect(result.body.immutableArtifact.artifactHash).toMatch(/^[a-f0-9]{64}$/);
  return result.body;
}

async function reopenBudget(page: Page, code: string) {
  const result = await api<{ budgets: ReopenedBudget[] }>(page, '/api/budgets');
  expect(result.status).toBe(200);
  const budget = result.body.budgets.find((item) => item.code === code);
  expect(budget).toBeTruthy();
  return budget!;
}

test('1 · presupuesto multibloque guarda, reabre y recarga con totales servidor e instantánea inmutable', async ({ page }) => {
  await login(page);
  const blocks = [
    block('Enfermería mañana', nursingCategory, '2026-10-13', 'morning', 40, 0),
    block('Medicina tarde', medicineCategory, '2026-10-14', 'afternoon', 75, 1),
  ];
  const calculation = await calculate(page, blocks);
  expect(calculation.blocks).toHaveLength(2);

  const created = await createBudget(page, calculation, 'E2E ciclo presupuesto');
  expect(created.immutableArtifact.version).toBe(1);
  expect(created.immutableArtifact.artifactHash).toMatch(/^[a-f0-9]{64}$/);

  const reopened = await reopenBudget(page, created.budget.code);
  expect(reopened.serviceBlocks.map((item) => item.serviceName)).toEqual(['Enfermería mañana', 'Medicina tarde']);
  expect(reopened.serviceBlocks.map((item) => item.professionalCategory)).toEqual([nursingCategory, medicineCategory]);
  expect(reopened.totalFinal).toBe(calculation.totals.totalFinal);

  await page.reload();
  const afterReload = await reopenBudget(page, created.budget.code);
  expect(afterReload.totalFinal).toBe(calculation.totals.totalFinal);
});

test('2 · edición económica produce v2 distinta sin alterar la identidad de la v1 emitida', async ({ page }) => {
  await login(page);
  const v1Blocks = [
    block('Bloque A v1', nursingCategory, '2026-10-15', 'morning', 30, 0),
    block('Bloque B v1', medicineCategory, '2026-10-16', 'night', 70, 1),
  ];
  const calcV1 = await calculate(page, v1Blocks);
  const created = await createBudget(page, calcV1, 'E2E versionado v1');
  const v1Hash = created.immutableArtifact.artifactHash;

  const v2Blocks = [
    block('Bloque B v2', medicineCategory, '2026-10-16', 'night', 70, 0),
    block('Bloque A v2', nursingCategory, '2026-10-15', 'morning', 55, 1),
  ];
  const calcV2 = await calculate(page, v2Blocks);
  const edited = await api<UpdatedBudget>(page, '/api/budgets', {
    method: 'PUT',
    body: { id: created.budget.id, serviceBlocks: [], calculationToken: calcV2.totals.calculationToken, description: 'E2E versionado v2' },
  });
  expect(edited.status).toBe(200);
  expect(edited.body.immutableArtifact.version).toBe(2);
  expect(edited.body.immutableArtifact.artifactHash).toMatch(/^[a-f0-9]{64}$/);
  expect(edited.body.immutableArtifact.artifactHash).not.toBe(v1Hash);
  expect(created.immutableArtifact.artifactHash).toBe(v1Hash);
  expect(edited.body.budget.serviceBlocks.map((item) => item.serviceName)).toEqual(['Bloque B v2', 'Bloque A v2']);
  expect(edited.body.budget.totalFinal).toBe(calcV2.totals.totalFinal);

  await page.goto('/recuperar-password');
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const reopened = await reopenBudget(page, created.budget.code);
  expect(reopened.serviceBlocks.map((item) => item.serviceName)).toEqual(['Bloque B v2', 'Bloque A v2']);
  expect(reopened.totalFinal).toBe(calcV2.totals.totalFinal);
});

test('3 · doble guardado consume un cálculo una sola vez y crea exactamente un presupuesto', async ({ page }) => {
  await login(page);
  const marker = `E2E doble guardado ${Date.now()}`;
  const calculation = await calculate(page, [block(marker, nursingCategory, '2026-10-17', 'morning', 42, 0)]);

  const outcomes = await page.evaluate(async ({ token, description }) => {
    const payload = JSON.stringify({ clientId: 'e2e-client-001', calculationToken: token, description, status: 'borrador' });
    const save = async () => {
      const response = await fetch('/api/budgets', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: payload });
      return { status: response.status, body: await response.json() };
    };
    return Promise.all([save(), save()]);
  }, { token: calculation.totals.calculationToken, description: marker });

  expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([201, 409]);
  const listing = await api<{ budgets: Array<{ description?: string }> }>(page, '/api/budgets');
  expect(listing.status).toBe(200);
  expect(listing.body.budgets.filter((budget) => budget.description === marker)).toHaveLength(1);
});

test('4 · documento cliente y firma electrónica recorren el presupuesto sin filtrar economía interna', async ({ page }) => {
  await login(page);
  const calculation = await calculate(page, [
    block('Enfermería presencial', nursingCategory, '2026-10-18', 'morning', 44, 0),
    block('Medicina remota', medicineCategory, '2026-10-18', 'afternoon', 88, 1),
  ]);
  const created = await createBudget(page, calculation, 'E2E documento y firma');

  const clientDocument = await api<string>(page, `/api/pdf?id=${created.budget.id}&mode=client`);
  expect(clientDocument.status).toBe(200);
  expect(String(clientDocument.body)).toContain('Enfermería presencial');
  expect(String(clientDocument.body)).toContain('Medicina remota');
  expect(String(clientDocument.body)).not.toContain('coste interno');
  expect(String(clientDocument.body)).not.toContain('commissionAmount');

  const signerEmail = 'cliente.firma@example.invalid';
  const signature = await api<SignatureCreated>(page, '/api/signatures', {
    method: 'POST', body: { budgetId: created.budget.id, recipientEmail: signerEmail },
  });
  expect(signature.status).toBe(201);
  expect(signature.body.id).toBeTruthy();
  expect(signature.body.signingUrl).toContain('/firmar/');

  const signatureRequests = await api<SignatureList>(page, `/api/signatures?budgetId=${created.budget.id}`);
  expect(signatureRequests.status).toBe(200);
  expect(signatureRequests.body.requests.find((request) => request.id === signature.body.id)?.status).toBe('pending');

  const token = new URL(signature.body.signingUrl).pathname.split('/').filter(Boolean).pop();
  expect(token).toBeTruthy();

  const publicReview = await api<{ status: string; budget: { code: string } }>(page, `/api/public/signature?token=${encodeURIComponent(token!)}`);
  expect(publicReview.status).toBe(200);
  expect(publicReview.body.status).toBe('pending');
  expect(publicReview.body.budget.code).toBe(created.budget.code);

  const accepted = await api<{ status: string }>(page, '/api/public/signature', {
    method: 'POST',
    body: {
      token,
      signerEmail,
      signerName: 'Persona Cliente E2E',
      signatureData: validSignatureData,
      consent: true,
    },
  });
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');
});
