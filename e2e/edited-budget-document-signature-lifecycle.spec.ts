import { expect, test, type Page } from '@playwright/test';

const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = { totals: { calculationToken: string; totalFinal: number } };
type SavedBudget = { id: string; code: string; description: string | null; totalFinal: number; status: string };
type SavedPayload = { budget: SavedBudget; immutableArtifact: { version: number; artifactHash: string } };
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
  const password = process.env.E2E_MAESTRO_PASSWORD;
  if (!password) throw new Error('E2E_MAESTRO_PASSWORD is required');
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

function block(label: string, fixedPrice: number, category: string, date: string) {
  return {
    blockType: 'material', serviceName: label, professionalCategory: category,
    dateMode: 'range', dateRangeStart: date, dateRangeEnd: date,
    shiftType: 'morning', hoursPerDay: 8, unitType: 'unidad', quantity: 1,
    pricePerHour: fixedPrice, fixedPrice, ivaPercent: 21,
  };
}

async function calculate(page: Page, edited = false) {
  const blocks = edited
    ? [
        block('Servicio actualizado E2E medicina', 47, 'e2e-category-medicine', '2026-11-12'),
        block('Servicio añadido E2E enfermería', 23, 'e2e-category-nursing', '2026-11-13'),
      ]
    : [block('Servicio original E2E enfermería', 19, 'e2e-category-nursing', '2026-11-11')];
  const result = await api<Calculation>(page, '/api/calculations', 'POST', { blocks, discountPercent: 0, ivaPercent: 21 });
  expect(result.status).toBe(200);
  return result.body;
}

async function createAndEdit(page: Page, marker: string) {
  const initialCalc = await calculate(page, false);
  const created = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: initialCalc.totals.calculationToken,
    description: `${marker} original`, status: 'borrador',
  });
  expect(created.status).toBe(201);
  expect(created.body.immutableArtifact.version).toBe(1);

  const editedCalc = await calculate(page, true);
  const edited = await api<SavedPayload>(page, '/api/budgets', 'PUT', {
    id: created.body.budget.id, serviceBlocks: [], calculationToken: editedCalc.totals.calculationToken,
    description: `${marker} editado`,
  });
  expect(edited.status).toBe(200);
  expect(edited.body.immutableArtifact.version).toBe(2);
  expect(edited.body.immutableArtifact.artifactHash).not.toBe(created.body.immutableArtifact.artifactHash);
  return { created: created.body, edited: edited.body, editedCalc };
}

async function issue(page: Page, budgetId: string, email = 'cliente.editado@example.invalid') {
  const response = await api<SignatureRequest>(page, '/api/signatures', 'POST', { budgetId, recipientEmail: email });
  expect(response.status).toBe(201);
  return response.body;
}

function tokenFrom(url: string) {
  return new URL(url).pathname.split('/').pop()!;
}

async function accept(page: Page, signingUrl: string, email = 'cliente.editado@example.invalid') {
  return api<{ status: string }>(page, '/api/public/signature', 'POST', {
    token: tokenFrom(signingUrl), signerName: 'Cliente Editado E2E', signerEmail: email,
    signatureData: validPng, consent: true,
  });
}

test('1 · documento cliente de presupuesto editado usa la versión vigente y no revive contenido anterior', async ({ page }) => {
  await login(page);
  const lifecycle = await createAndEdit(page, `E2E doc latest ${Date.now()}`);
  const document = await page.evaluate(async (budgetId) => {
    const response = await fetch(`/api/pdf?id=${encodeURIComponent(budgetId)}&mode=client`, { credentials: 'same-origin' });
    return { status: response.status, html: await response.text() };
  }, lifecycle.edited.budget.id);
  expect(document.status).toBe(200);
  expect(document.html).toContain(lifecycle.edited.budget.code);
  expect(document.html).toContain('Servicio actualizado E2E medicina');
  expect(document.html).toContain('Servicio añadido E2E enfermería');
  expect(document.html).not.toContain('Servicio original E2E enfermería');
  expect(document.html).not.toMatch(/coste interno|margen interno|comisión comercial/i);
  expect(lifecycle.edited.budget.totalFinal).toBe(lifecycle.editedCalc.totals.totalFinal);
});

test('2 · firma previa a la edición no acepta la versión nueva y la reemisión usa el total vigente', async ({ page }) => {
  await login(page);
  const initialCalc = await calculate(page, false);
  const created = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: initialCalc.totals.calculationToken,
    description: `E2E stale then reissue ${Date.now()}`, status: 'borrador',
  });
  expect(created.status).toBe(201);
  const oldSignature = await issue(page, created.body.budget.id);

  const editedCalc = await calculate(page, true);
  const edited = await api<SavedPayload>(page, '/api/budgets', 'PUT', {
    id: created.body.budget.id, serviceBlocks: [], calculationToken: editedCalc.totals.calculationToken,
    description: 'E2E reemitido tras edición',
  });
  expect(edited.status).toBe(200);

  const stale = await api<{ status: string; error: string }>(page, `/api/public/signature?token=${encodeURIComponent(tokenFrom(oldSignature.signingUrl))}`);
  expect(stale.status).toBe(409);

  const fresh = await issue(page, created.body.budget.id);
  const review = await api<{ status: string; budget: { totalFinal: number } }>(page, `/api/public/signature?token=${encodeURIComponent(tokenFrom(fresh.signingUrl))}`);
  expect(review.status).toBe(200);
  expect(review.body.status).toBe('pending');
  expect(review.body.budget.totalFinal).toBe(editedCalc.totals.totalFinal);
});

test('3 · aceptación reemitida persiste tras refresh y navegación atrás', async ({ page }) => {
  await login(page);
  const lifecycle = await createAndEdit(page, `E2E accepted navigation ${Date.now()}`);
  const signing = await issue(page, lifecycle.edited.budget.id);
  const accepted = await accept(page, signing.signingUrl);
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');

  await page.goto('/');
  const search = page.getByPlaceholder('Buscar por código, descripción o cliente...');
  await search.fill(lifecycle.edited.budget.code);
  await search.press('Enter');
  await expect(page.getByRole('row').filter({ hasText: lifecycle.edited.budget.code })).toContainText(/aceptado/i);
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: lifecycle.edited.budget.code })).toContainText(/aceptado/i);
  await page.goto('/recuperar-password');
  await page.goBack();
  await expect(page).toHaveURL('/');
  const persisted = await api<{ budgets: SavedBudget[] }>(page, `/api/budgets?search=${encodeURIComponent(lifecycle.edited.budget.code)}`);
  expect(persisted.status).toBe(200);
  expect(persisted.body.budgets[0].status).toBe('aceptado');
});

test('4 · certificado final corresponde a la firma vigente y conserva revocada la anterior', async ({ page }) => {
  await login(page);
  const initialCalc = await calculate(page, false);
  const created = await api<SavedPayload>(page, '/api/budgets', 'POST', {
    clientId: 'e2e-client-001', calculationToken: initialCalc.totals.calculationToken,
    description: `E2E cert edited ${Date.now()}`, status: 'borrador',
  });
  expect(created.status).toBe(201);
  const prior = await issue(page, created.body.budget.id);

  const editedCalc = await calculate(page, true);
  const edited = await api<SavedPayload>(page, '/api/budgets', 'PUT', {
    id: created.body.budget.id, serviceBlocks: [], calculationToken: editedCalc.totals.calculationToken,
    description: 'E2E certificado versión editada',
  });
  expect(edited.status).toBe(200);
  expect((await api(page, `/api/public/signature?token=${encodeURIComponent(tokenFrom(prior.signingUrl))}`)).status).toBe(409);

  const current = await issue(page, created.body.budget.id);
  expect((await accept(page, current.signingUrl)).status).toBe(200);

  const listed = await api<{ requests: Array<{ id: string; status: string }> }>(page, `/api/signatures?budgetId=${created.body.budget.id}`);
  expect(listed.status).toBe(200);
  expect(listed.body.requests.find((row) => row.id === prior.id)?.status).toBe('revoked');
  expect(listed.body.requests.find((row) => row.id === current.id)?.status).toBe('accepted');

  const certificate = await page.evaluate(async (id) => {
    const response = await fetch(`/api/signatures?certificate=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    return { status: response.status, html: await response.text() };
  }, current.id);
  expect(certificate.status).toBe(200);
  expect(certificate.html).toContain('Certificado de aceptación electrónica');
  expect(certificate.html).toContain(edited.body.budget.code);
});
