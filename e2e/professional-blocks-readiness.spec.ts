import { expect, test, type Page } from '@playwright/test';

const maestroPassword = (() => {
  const value = process.env.E2E_MAESTRO_PASSWORD;
  if (!value) throw new Error('E2E_MAESTRO_PASSWORD es obligatoria para ejecutar esta suite aislada');
  return value;
})();

type Issue = { field: string; kind: string; message: string };
type Calculation = {
  blocks: Array<{
    workingDates: string[];
    totalWorkingDays: number;
    totalHours: number;
    shiftBreakdown: { total: number; night: number; sunday: number; weekend: number };
  }>;
  totals: null | { totalFinal: number; calculationToken?: string };
  commercial: {
    status: 'calculated' | 'pending_configuration';
    requiresAuthorization: boolean;
    pendingFields?: string[];
  };
  issues?: Issue[];
};

type Location = { cc: string; province: string; municipality: string };

async function login(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('e2e.maestro@example.invalid');
  await page.locator('input#password').fill(maestroPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/');
}

async function calculate(page: Page, blocks: unknown[], location: Location): Promise<{ status: number; body: Calculation }> {
  return page.evaluate(async ({ requestBlocks, requestLocation }) => {
    const response = await fetch('/api/calculations', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: requestBlocks, location: requestLocation, discountPercent: 0, ivaPercent: 21 }),
    });
    return { status: response.status, body: await response.json() };
  }, { requestBlocks: blocks, requestLocation: location });
}

function professionalBlock(params: {
  name: string;
  category: string;
  contractType?: 'indefinido' | 'temporal' | 'fijo_discontinuo' | 'mercantil_autonomo';
  shiftType: 'morning' | 'afternoon' | 'night' | '24h';
  start: string;
  end: string;
  positions?: number;
}) {
  return {
    blockType: 'profesional_hora', serviceName: params.name, professionalCategory: params.category,
    puestosSimultaneos: params.positions ?? 1, plantillaSeleccionada: params.positions ?? 1,
    pricePerHour: 0, contractType: params.contractType, dateMode: 'range',
    dateRangeStart: params.start, dateRangeEnd: params.end, daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
    excludeSundays: false, excludeHolidays: false, shiftType: params.shiftType,
    hoursPerDay: params.shiftType === '24h' ? 24 : 8, breakMinutes: 0,
    unitType: 'hora', quantity: 1, ivaPercent: 21,
  };
}

const madrid: Location = { cc: 'Madrid', province: 'Madrid', municipality: 'Madrid' };
const valladolid: Location = { cc: 'Castilla y León', province: 'Valladolid', municipality: 'Valladolid' };

test('1 · múltiples categorías/turnos calculan calendario y bloquean solo los pluses sin fuente verificable', async ({ page }) => {
  await login(page);
  const blocks = [
    professionalBlock({
      name: 'E2E Enfermería mañana', category: 'e2e-category-nursing', contractType: 'indefinido',
      shiftType: 'morning', start: '2026-09-14', end: '2026-09-16', positions: 2,
    }),
    professionalBlock({
      name: 'E2E Medicina noche', category: 'e2e-category-medicine', contractType: 'temporal',
      shiftType: 'night', start: '2026-09-17', end: '2026-09-18', positions: 1,
    }),
    professionalBlock({
      name: 'E2E Enfermería repetida', category: 'e2e-category-nursing', contractType: 'fijo_discontinuo',
      shiftType: 'afternoon', start: '2026-09-19', end: '2026-09-20', positions: 1,
    }),
  ];

  const result = await calculate(page, blocks, madrid);
  expect(result.status).toBe(200);
  expect(result.body.blocks).toHaveLength(3);
  expect(result.body.blocks.every((item) => item.totalWorkingDays > 0 && item.totalHours > 0)).toBe(true);
  expect(result.body.commercial.status).toBe('pending_configuration');
  expect(result.body.totals).toBeNull();
  expect(result.body.issues?.some((issue) => issue.field.includes('verifiedLaborInputs.productive_hour_gross'))).toBe(false);
  expect(result.body.issues?.some((issue) => issue.field.includes('surcharges.'))).toBe(true);
});

test('2 · Madrid y Valladolid pueden calcular días ordinarios con su propia capa verified sin fallback territorial', async ({ page }) => {
  await login(page);
  const block = professionalBlock({
    name: 'E2E territorial', category: 'e2e-category-nursing', contractType: 'indefinido',
    shiftType: 'morning', start: '2026-09-14', end: '2026-09-15',
  });

  const madridResult = await calculate(page, [block], madrid);
  const valladolidResult = await calculate(page, [block], valladolid);
  expect(madridResult.status).toBe(200);
  expect(valladolidResult.status).toBe(200);
  expect(madridResult.body.commercial.status).toBe('calculated');
  expect(valladolidResult.body.commercial.status).toBe('calculated');
  expect(madridResult.body.totals?.calculationToken).toBeTruthy();
  expect(valladolidResult.body.totals?.calculationToken).toBeTruthy();
  expect(madridResult.body.issues).toBeUndefined();
  expect(valladolidResult.body.issues).toBeUndefined();
});

test('3 · categoría inexistente y contratación omitida producen incidencias explícitas y ningún token reutilizable', async ({ page }) => {
  await login(page);
  const invalid = professionalBlock({
    name: 'E2E inválido', category: 'categoria-inexistente', shiftType: '24h',
    start: '2026-09-21', end: '2026-09-21', positions: 2,
  });

  const result = await calculate(page, [invalid], madrid);
  expect(result.status).toBe(200);
  expect(result.body.commercial.status).toBe('pending_configuration');
  expect(result.body.totals).toBeNull();
  expect(result.body.issues?.some((issue) => issue.field === 'blocks.0.professionalCategory')).toBe(true);
  expect(result.body.issues?.some((issue) => issue.field === 'blocks.0.contractType')).toBe(true);
  expect(result.body.commercial.pendingFields).toContain('blocks.0.professionalCategory');
  expect(result.body.commercial.pendingFields).toContain('blocks.0.contractType');
});

test('4 · refresh y back-forward no convierten una cotización profesional bloqueada en un total válido', async ({ page }) => {
  await login(page);
  const block = professionalBlock({
    name: 'E2E navegación profesional', category: 'e2e-category-medicine', contractType: 'mercantil_autonomo',
    shiftType: 'night', start: '2026-09-22', end: '2026-09-23',
  });

  const first = await calculate(page, [block], madrid);
  expect(first.body.totals).toBeNull();
  expect(first.body.commercial.status).toBe('pending_configuration');

  await page.goto('/login');
  await page.goBack();
  await page.reload();
  await expect(page).toHaveURL('/');

  const second = await calculate(page, [block], madrid);
  expect(second.status).toBe(200);
  expect(second.body.totals).toBeNull();
  expect(second.body.commercial.status).toBe('pending_configuration');
  expect(new Set(second.body.commercial.pendingFields)).toEqual(new Set(first.body.commercial.pendingFields));
});
