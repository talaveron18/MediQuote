import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = { totals: { calculationToken: string }; commercial: { status: string } };
type CreatedBudget = { budget: { id: string; code: string } };
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

function block(marker: string) {
  return {
    blockType: 'material', serviceName: marker, professionalCategory: 'e2e-category-nursing',
    dateMode: 'range', dateRangeStart: '2026-10-12', dateRangeEnd: '2026-10-12',
    shiftType: 'morning', hoursPerDay: 8, unitType: 'unidad', quantity: 1,
    pricePerHour: 19, fixedPrice: 19, ivaPercent: 21,
  };
}

async function createBudget(page: Page, marker: string) {
  const calculation = await api<Calculation>(page, '/api/calculations', 'POST', {
    blocks: [block(marker)], discountPercent: 0, ivaPercent: 21,
  });
  expect(calculation.status).toBe(200);
  expect(calculation.body.commercial.status).toBe('calculated');
  const saved = await api<CreatedBudget>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: calculation.body.totals.calculationToken,
    description: marker, status: 'borrador',
  });
  expect(saved.status).toBe(201);
  return saved.body.budget;
}

async function issueSignature(page: Page, budgetId: string) {
  const result = await api<SignatureRequest>(page, '/api/signatures', 'POST', {
    budgetId, recipientEmail: 'closure.signature@example.invalid',
  });
  expect(result.status).toBe(201);
  return { ...result.body, token: new URL(result.body.signingUrl).pathname.split('/').filter(Boolean).pop()! };
}

const validSignatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function accept(page: Page, token: string) {
  return api<{ status?: string; error?: string }>(page, '/api/public/signature', 'POST', {
    token,
    signerName: 'Cliente E2E',
    signerEmail: 'closure.signature@example.invalid',
    signatureData: validSignatureData,
    consent: true,
  });
}

test.afterAll(async () => { await db.$disconnect(); });

test('caducar un presupuesto revoca la firma pending dentro de la misma transacción', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E cierre ${Date.now()}`);
  const signature = await issueSignature(page, budget.id);
  expect((await db.budgetSignatureRequest.findUnique({ where: { id: signature.id }, select: { status: true } }))?.status).toBe('pending');

  const closed = await api(page, `/api/budgets?id=${encodeURIComponent(budget.id)}`, 'DELETE');
  expect(closed.status).toBe(200);
  expect((await db.budgetSignatureRequest.findUnique({ where: { id: signature.id }, select: { status: true } }))?.status).toBe('revoked');

  const publicGet = await api<{ status?: string; error?: string }>(page, `/api/public/signature?token=${encodeURIComponent(signature.token)}`);
  expect(publicGet.status).toBe(409);
  expect(publicGet.body.status).toBe('revoked');
  const publicPost = await accept(page, signature.token);
  expect(publicPost.status).toBe(409);
});

test('un presupuesto caducado no puede generar una nueva solicitud de firma', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E no reemitir ${Date.now()}`);
  const closed = await api(page, `/api/budgets?id=${encodeURIComponent(budget.id)}`, 'DELETE');
  expect(closed.status).toBe(200);

  const before = await db.budgetSignatureRequest.count({ where: { budgetId: budget.id } });
  const issue = await api<{ error: string }>(page, '/api/signatures', 'POST', {
    budgetId: budget.id, recipientEmail: 'closure.signature@example.invalid',
  });
  expect(issue.status).toBe(409);
  expect(issue.body.error).toMatch(/caducado/i);
  expect(await db.budgetSignatureRequest.count({ where: { budgetId: budget.id } })).toBe(before);
});

test('el listado privado normaliza y persiste como expired una solicitud temporalmente vencida', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E expiración ${Date.now()}`);
  const signature = await issueSignature(page, budget.id);
  await db.budgetSignatureRequest.update({
    where: { id: signature.id }, data: { expiresAt: new Date(Date.now() - 60_000) },
  });

  const listing = await api<{ requests: Array<{ id: string; status: string }> }>(page, `/api/signatures?budgetId=${encodeURIComponent(budget.id)}`);
  expect(listing.status).toBe(200);
  expect(listing.body.requests.find((row) => row.id === signature.id)?.status).toBe('expired');
  expect((await db.budgetSignatureRequest.findUnique({ where: { id: signature.id }, select: { status: true } }))?.status).toBe('expired');
});

test('aceptado sigue verificable y su certificado no se rompe por el cierre lógico de caducado', async ({ page }) => {
  await login(page);
  const budget = await createBudget(page, `E2E certificado ${Date.now()}`);
  const signature = await issueSignature(page, budget.id);
  const accepted = await accept(page, signature.token);
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');

  const certificate = await page.evaluate(async (id) => {
    const response = await fetch(`/api/signatures?certificate=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    return { status: response.status, html: await response.text() };
  }, signature.id);
  expect(certificate.status).toBe(200);
  expect(certificate.html).toContain('Certificado de aceptación electrónica');

  const closeAccepted = await api(page, `/api/budgets?id=${encodeURIComponent(budget.id)}`, 'DELETE');
  expect(closeAccepted.status).toBe(409);
  const certificateAgain = await api(page, `/api/signatures?certificate=${encodeURIComponent(signature.id)}`);
  expect(certificateAgain.status).toBe(200);
});
