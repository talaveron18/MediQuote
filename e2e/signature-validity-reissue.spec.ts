import { expect, test, type Page } from '@playwright/test';

const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

const nursingCategory = 'e2e-category-nursing';
const validSignatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = { status: number; body: T; cacheControl: string | null };
type Calculation = { totals: { calculationToken: string } };
type CreatedBudget = { budget: { id: string; code: string; status: string }; immutableArtifact: { version: number; artifactHash: string } };
type UpdatedBudget = { budget: { id: string; code: string; validUntil: string | null }; immutableArtifact: { version: number; artifactHash: string } };
type SignatureCreated = { id: string; signingUrl: string };
type SignatureList = { requests: Array<{ id: string; status: string; acceptedAt?: string | null }> };

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
    return { status: response.status, body, cacheControl: response.headers.get('cache-control') };
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

function block(marker: string) {
  return {
    blockType: 'material',
    serviceName: marker,
    professionalCategory: nursingCategory,
    dateMode: 'range',
    dateRangeStart: '2026-11-05',
    dateRangeEnd: '2026-11-05',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity: 1,
    pricePerHour: 60,
    fixedPrice: 60,
    ivaPercent: 21,
  };
}

async function calculate(page: Page, marker: string) {
  const result = await api<Calculation>(page, '/api/calculations', {
    method: 'POST',
    body: { blocks: [block(marker)], discountPercent: 0, ivaPercent: 21 },
  });
  expect(result.status).toBe(200);
  expect(result.body.totals.calculationToken).toBeTruthy();
  return result.body;
}

async function createBudget(page: Page, marker: string, validUntil: string) {
  const calculation = await calculate(page, marker);
  const result = await api<CreatedBudget>(page, '/api/budgets', {
    method: 'POST',
    body: {
      clientId: 'e2e-client-001',
      calculationToken: calculation.totals.calculationToken,
      description: marker,
      validUntil,
      status: 'borrador',
    },
  });
  expect(result.status).toBe(201);
  return result.body;
}

async function issueSignature(page: Page, budgetId: string, email: string) {
  const result = await api<SignatureCreated>(page, '/api/signatures', {
    method: 'POST',
    body: { budgetId, recipientEmail: email },
  });
  expect(result.status).toBe(201);
  const token = new URL(result.body.signingUrl).pathname.split('/').filter(Boolean).pop();
  expect(token).toBeTruthy();
  return { ...result.body, token: token! };
}

async function sign(page: Page, token: string, email: string, name: string) {
  return api<{ status?: string; error?: string }>(page, '/api/public/signature', {
    method: 'POST',
    body: { token, signerEmail: email, signerName: name, signatureData: validSignatureData, consent: true },
  });
}

test('1 · cambiar la vigencia revoca el enlace pendiente anterior', async ({ page }) => {
  await login(page);
  const marker = `E2E vigencia revoca ${Date.now()}`;
  const created = await createBudget(page, marker, '2026-11-20T00:00:00.000Z');
  const signature = await issueSignature(page, created.budget.id, 'vigencia.revoca@example.invalid');

  const updated = await api<UpdatedBudget>(page, '/api/budgets', {
    method: 'PUT',
    body: { id: created.budget.id, validUntil: '2026-11-30T00:00:00.000Z' },
  });
  expect(updated.status).toBe(200);
  expect(updated.body.immutableArtifact.version).toBeGreaterThan(created.immutableArtifact.version);

  const oldLink = await api<{ status?: string; error?: string }>(page, `/api/public/signature?token=${encodeURIComponent(signature.token)}`);
  expect(oldLink.status).toBe(409);
  expect(oldLink.body.status).toBe('revoked');
  expect(oldLink.cacheControl).toContain('no-store');
});

test('2 · la reemisión tras editar vigencia expone el documento actualizado y permite aceptar', async ({ page }) => {
  await login(page);
  const marker = `E2E vigencia reemite ${Date.now()}`;
  const created = await createBudget(page, marker, '2026-11-20T00:00:00.000Z');
  const first = await issueSignature(page, created.budget.id, 'vigencia.reemite@example.invalid');

  const newValidUntil = '2026-12-05T00:00:00.000Z';
  const updated = await api<UpdatedBudget>(page, '/api/budgets', {
    method: 'PUT',
    body: { id: created.budget.id, validUntil: newValidUntil },
  });
  expect(updated.status).toBe(200);

  const second = await issueSignature(page, created.budget.id, 'vigencia.reemite@example.invalid');
  expect(second.id).not.toBe(first.id);
  const review = await api<{ status: string; budget: { validUntil: string | null; description: string } }>(
    page,
    `/api/public/signature?token=${encodeURIComponent(second.token)}`,
  );
  expect(review.status).toBe(200);
  expect(review.body.status).toBe('pending');
  expect(new Date(review.body.budget.validUntil!).toISOString()).toBe(newValidUntil);
  expect(review.body.budget.description).toBe(marker);

  const accepted = await sign(page, second.token, 'vigencia.reemite@example.invalid', 'Cliente Vigencia Nueva');
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');
});

test('3 · un enlace revocado no recupera validez después de aceptar una reemisión', async ({ page }) => {
  await login(page);
  const marker = `E2E token viejo ${Date.now()}`;
  const email = 'token.viejo@example.invalid';
  const created = await createBudget(page, marker, '2026-11-20T00:00:00.000Z');
  const oldSignature = await issueSignature(page, created.budget.id, email);

  const updated = await api<UpdatedBudget>(page, '/api/budgets', {
    method: 'PUT',
    body: { id: created.budget.id, validUntil: '2026-12-10T00:00:00.000Z' },
  });
  expect(updated.status).toBe(200);
  const currentSignature = await issueSignature(page, created.budget.id, email);
  const accepted = await sign(page, currentSignature.token, email, 'Cliente Token Actual');
  expect(accepted.status).toBe(200);

  const reusedOld = await sign(page, oldSignature.token, email, 'Cliente Token Viejo');
  expect(reusedOld.status).toBe(409);
  expect(reusedOld.body.status).toBe('revoked');
  expect(reusedOld.cacheControl).toContain('no-store');
});

test('4 · backoffice conserva una sola aceptación y mantiene la solicitud anterior revocada', async ({ page }) => {
  await login(page);
  const marker = `E2E lista reemision ${Date.now()}`;
  const email = 'lista.reemision@example.invalid';
  const created = await createBudget(page, marker, '2026-11-20T00:00:00.000Z');
  const oldSignature = await issueSignature(page, created.budget.id, email);

  const updated = await api<UpdatedBudget>(page, '/api/budgets', {
    method: 'PUT',
    body: { id: created.budget.id, validUntil: '2026-12-15T00:00:00.000Z' },
  });
  expect(updated.status).toBe(200);
  const currentSignature = await issueSignature(page, created.budget.id, email);
  const accepted = await sign(page, currentSignature.token, email, 'Cliente Lista Firma');
  expect(accepted.status).toBe(200);

  const list = await api<SignatureList>(page, `/api/signatures?budgetId=${created.budget.id}`);
  expect(list.status).toBe(200);
  const oldRow = list.body.requests.find((item) => item.id === oldSignature.id);
  const currentRow = list.body.requests.find((item) => item.id === currentSignature.id);
  expect(oldRow?.status).toBe('revoked');
  expect(currentRow?.status).toBe('accepted');
  expect(currentRow?.acceptedAt).toBeTruthy();
  expect(list.body.requests.filter((item) => item.status === 'accepted')).toHaveLength(1);
}