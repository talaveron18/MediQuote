import { expect, test, type Page } from '@playwright/test';

const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

const nursingCategory = 'e2e-category-nursing';
const validSignatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type ApiResult<T = unknown> = { status: number; body: T };
type Calculation = { totals: { calculationToken: string; totalFinal: number } };
type Budget = { id: string; code: string; status: string; description: string | null; totalFinal: number; serviceBlocks: Array<{ serviceName: string }> };
type CreatedBudget = { budget: Budget; immutableArtifact: { version: number; artifactHash: string } };

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
    dateRangeStart: '2026-10-19',
    dateRangeEnd: '2026-10-19',
    shiftType: 'morning',
    hoursPerDay: 8,
    unitType: 'unidad',
    quantity: 1,
    pricePerHour: 40,
    fixedPrice: 40,
    ivaPercent: 21,
  };
}

async function createDraft(page: Page, marker: string) {
  const calculation = await api<Calculation>(page, '/api/calculations', {
    method: 'POST',
    body: { blocks: [block(marker)], discountPercent: 0, ivaPercent: 21 },
  });
  expect(calculation.status).toBe(200);
  expect(calculation.body.totals.calculationToken).toBeTruthy();

  const created = await api<CreatedBudget>(page, '/api/budgets', {
    method: 'POST',
    body: {
      clientId: 'e2e-client-001',
      calculationToken: calculation.body.totals.calculationToken,
      description: marker,
      status: 'borrador',
    },
  });
  expect(created.status).toBe(201);
  expect(created.body.immutableArtifact.version).toBe(1);
  return { created: created.body, expectedTotal: calculation.body.totals.totalFinal };
}

async function reopen(page: Page, id: string) {
  const result = await api<{ budgets: Budget[] }>(page, `/api/budgets?id=${encodeURIComponent(id)}`);
  expect(result.status).toBe(200);
  expect(result.body.budgets).toHaveLength(1);
  return result.body.budgets[0];
}

test('1 · guardar y reabrir conserva identidad, bloques y total calculado', async ({ page }) => {
  await login(page);
  const marker = `E2E ciclo guardar-reabrir ${Date.now()}`;
  const { created, expectedTotal } = await createDraft(page, marker);

  const reopened = await reopen(page, created.budget.id);
  expect(reopened.id).toBe(created.budget.id);
  expect(reopened.code).toBe(created.budget.code);
  expect(reopened.status).toBe('borrador');
  expect(reopened.description).toBe(marker);
  expect(reopened.totalFinal).toBe(expectedTotal);
  expect(reopened.serviceBlocks.map((item) => item.serviceName)).toContain(marker);
});

test('2 · editar metadatos y reabrir conserva economía y crea una nueva versión sellada', async ({ page }) => {
  await login(page);
  const marker = `E2E ciclo editar ${Date.now()}`;
  const { created } = await createDraft(page, marker);
  const before = await reopen(page, created.budget.id);
  const editedDescription = `${marker} · editado`;

  const edited = await api<CreatedBudget>(page, '/api/budgets', {
    method: 'PUT',
    body: { id: created.budget.id, description: editedDescription, clientNotes: 'Nota cliente E2E' },
  });
  expect(edited.status).toBe(200);
  expect(edited.body.immutableArtifact.version).toBe(2);
  expect(edited.body.immutableArtifact.artifactHash).not.toBe(created.immutableArtifact.artifactHash);

  const reopened = await reopen(page, created.budget.id);
  expect(reopened.description).toBe(editedDescription);
  expect(reopened.totalFinal).toBe(before.totalFinal);
  expect(reopened.serviceBlocks.map((item) => item.serviceName)).toEqual(before.serviceBlocks.map((item) => item.serviceName));
});

test('3 · PDF cliente se genera desde la versión reabierta y editada', async ({ page }) => {
  await login(page);
  const marker = `E2E ciclo PDF ${Date.now()}`;
  const { created } = await createDraft(page, marker);
  const editedDescription = `${marker} · VERSION_EDITADA`;
  const edited = await api(page, '/api/budgets', { method: 'PUT', body: { id: created.budget.id, description: editedDescription } });
  expect(edited.status).toBe(200);

  const reopened = await reopen(page, created.budget.id);
  expect(reopened.description).toBe(editedDescription);
  const pdf = await api<string>(page, `/api/pdf?id=${encodeURIComponent(created.budget.id)}&mode=client`);
  expect(pdf.status).toBe(200);
  expect(String(pdf.body)).toContain('VERSION_EDITADA');
  expect(String(pdf.body)).toContain(marker);
});

test('4 · firma revisa la última edición, acepta una sola vez y deja el presupuesto aceptado', async ({ page }) => {
  await login(page);
  const marker = `E2E ciclo firma ${Date.now()}`;
  const { created } = await createDraft(page, marker);
  const editedDescription = `${marker} · FIRMA_VERSION_EDITADA`;
  const edited = await api(page, '/api/budgets', { method: 'PUT', body: { id: created.budget.id, description: editedDescription } });
  expect(edited.status).toBe(200);

  const issued = await api<{ signingUrl: string }>(page, '/api/signatures', {
    method: 'POST',
    body: { budgetId: created.budget.id, recipientEmail: 'cliente.lifecycle@example.invalid' },
  });
  expect(issued.status).toBe(201);
  const token = new URL(issued.body.signingUrl).pathname.split('/').filter(Boolean).pop();
  expect(token).toBeTruthy();

  const review = await api<{ budget: { description: string }; status: string }>(page, `/api/public/signature?token=${encodeURIComponent(token!)}`);
  expect(review.status).toBe(200);
  expect(review.body.budget.description).toBe(editedDescription);

  const acceptanceBody = {
    token,
    signerEmail: 'cliente.lifecycle@example.invalid',
    signerName: 'Cliente Lifecycle E2E',
    signatureData: validSignatureData,
    consent: true,
  };
  const accepted = await api<{ status: string }>(page, '/api/public/signature', { method: 'POST', body: acceptanceBody });
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe('accepted');
  expect((await reopen(page, created.budget.id)).status).toBe('aceptado');

  const replay = await api(page, '/api/public/signature', { method: 'POST', body: acceptanceBody });
  expect(replay.status).not.toBe(200);
});
