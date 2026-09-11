import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';

function requiredEnv(name: 'E2E_ADMIN_PASSWORD' | 'E2E_MAESTRO_PASSWORD' | 'E2E_COMMERCIAL_PASSWORD'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} es obligatoria para ejecutar esta suite aislada`);
  return value;
}

const adminPassword = requiredEnv('E2E_ADMIN_PASSWORD');
const maestroPassword = requiredEnv('E2E_MAESTRO_PASSWORD');
const commercialPassword = requiredEnv('E2E_COMMERCIAL_PASSWORD');
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function waitForLoginHydration(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
}

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await waitForLoginHydration(page);
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email);
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

type BrowserResponse = {
  status: number;
  text: string;
  headers: Record<string, string>;
};

async function browserRequest(
  page: import('@playwright/test').Page,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<BrowserResponse> {
  return page.evaluate(async ({ requestPath, method, body }) => {
    const response = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { status: response.status, text: await response.text(), headers };
  }, { requestPath: path, method: options.method ?? 'GET', body: options.body });
}

function expectPrivateNoStore(response: BrowserResponse) {
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.headers.pragma).toBe('no-cache');
  expect(response.headers.expires).toBe('0');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

async function seedAuditableBudget(code: string, snapshot: string) {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'e2e.admin@example.invalid' } });
  const budget = await db.budget.create({
    data: {
      code,
      clientId: 'e2e-client-001',
      createdById: admin.id,
      subtotal: 150,
      totalFinal: 181.5,
      ivaPercent: 21,
      ivaAmount: 31.5,
    },
  });
  await db.costingQuote.create({
    data: {
      userId: admin.id,
      budgetId: budget.id,
      snapshot,
      subtotal: 150,
      discountPercent: 0,
      discountAmount: 0,
      ivaPercent: 21,
      ivaAmount: 31.5,
      totalFinal: 181.5,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    },
  });
  return budget;
}

test.afterAll(async () => {
  await db.$disconnect();
});

test('auditoría de costes respeta la jerarquía: comercial denegado, maestro privilegiado y no-cache', async ({ page }) => {
  await login(page, 'e2e.comercial@example.invalid', commercialPassword);
  const forbidden = await browserRequest(page, '/api/cost-audits');
  expect(forbidden.status).toBe(403);

  await page.context().clearCookies();
  await login(page, 'e2e.maestro@example.invalid', maestroPassword);
  const maestroList = await browserRequest(page, '/api/cost-audits');
  expect(maestroList.status).toBe(200);
  expectPrivateNoStore(maestroList);

  await page.context().clearCookies();
  await login(page, 'e2e.admin@example.invalid', adminPassword);
  const adminList = await browserRequest(page, '/api/cost-audits');
  expect(adminList.status).toBe(200);
  expectPrivateNoStore(adminList);
});

test('auditoría válida se sella, el documento se fuerza a descarga binaria y errores no filtran snapshot', async ({ page }) => {
  const validBudget = await seedAuditableBudget(`E2E-AUD-${Date.now()}`, JSON.stringify({
    internalCost: {
      totalInternalCost: 120,
      laborBlocks: [{
        labor: {
          salaryForService: 70,
          totalPluses: 10,
          totalEmployerContributions: 25,
          totalOccupationalRisk: 5,
        },
        managementCost: 10,
        terminationProvision: 0,
        otherContractCosts: 0,
        overhead: 8,
      }],
      directCostTotal: 0,
      directCostOverhead: 0,
    },
    commercial: { commissionAmount: 4, finalGasiBenefit: 6 },
  }));
  const malformedBudget = await seedAuditableBudget(`E2E-AUD-BAD-${Date.now()}`, '{secret-internal-fragment');

  await login(page, 'e2e.admin@example.invalid', adminPassword);

  const created = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId: validBudget.id,
      actualCost: 120,
      actualBreakdown: {
        salary: 70,
        pluses: 10,
        socialSecurity: 25,
        occupationalRisk: 5,
        contractCosts: 10,
      },
      documentName: 'gestoria-\"../../prueba.html',
      documentType: 'text/html',
      documentBase64: Buffer.from('<script>alert(1)</script>').toString('base64'),
    },
  });
  expect(created.status).toBe(201);
  expectPrivateNoStore(created);
  const body = JSON.parse(created.text) as { audit: { id: string; hasDocument: boolean }; immutableArtifact: { artifactHash: string } };
  expect(body.audit.hasDocument).toBe(true);
  expect(body.immutableArtifact.artifactHash).toMatch(/^[a-f0-9]{64}$/);

  const document = await browserRequest(page, `/api/cost-audits?document=${encodeURIComponent(body.audit.id)}`);
  expect(document.status).toBe(200);
  expectPrivateNoStore(document);
  expect(document.headers['content-type']).toBe('application/octet-stream');
  expect(document.headers['content-disposition']).toContain('attachment;');
  expect(document.headers['content-disposition']).not.toContain('../');
  expect(document.headers['content-disposition']).not.toContain('"../../');

  const malformed = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: { budgetId: malformedBudget.id, actualCost: 1 },
  });
  expect(malformed.status).toBe(409);
  expectPrivateNoStore(malformed);
  expect(malformed.text).toContain('La cotización interna guardada no puede auditarse');
  expect(malformed.text).not.toContain('secret-internal-fragment');
  expect(malformed.text).not.toContain('Unexpected token');
});

test('justificante Base64 inválido se rechaza sin crear auditoría', async ({ page }) => {
  const budget = await seedAuditableBudget(`E2E-AUD-B64-${Date.now()}`, JSON.stringify({
    internalCost: {
      totalInternalCost: 100,
      laborBlocks: [{
        labor: {
          salaryForService: 60,
          totalPluses: 5,
          totalEmployerContributions: 20,
          totalOccupationalRisk: 5,
        },
        managementCost: 10,
        terminationProvision: 0,
        otherContractCosts: 0,
        overhead: 7,
      }],
      directCostTotal: 0,
      directCostOverhead: 0,
    },
    commercial: { commissionAmount: 3, finalGasiBenefit: 4 },
  }));
  const before = await db.costAudit.count({ where: { budgetId: budget.id } });

  await login(page, 'e2e.admin@example.invalid', adminPassword);
  const response = await browserRequest(page, '/api/cost-audits', {
    method: 'POST',
    body: {
      budgetId: budget.id,
      actualCost: 100,
      documentName: 'gestoria.pdf',
      documentType: 'application/pdf',
      documentBase64: '%%%NO-ES-BASE64%%%',
    },
  });

  expect(response.status).toBe(400);
  expectPrivateNoStore(response);
  expect(response.text).toContain('Base64 válido');
  expect(await db.costAudit.count({ where: { budgetId: budget.id } })).toBe(before);
});
