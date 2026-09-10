import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const enabled = process.env.MEDIQUOTE_E2E === '1';
const isolatedName = /mediquote_(e2e|test)/i.test(databaseUrl);

if (!enabled || !isolatedName) {
  throw new Error('seed-e2e refuses to run unless MEDIQUOTE_E2E=1 and DATABASE_URL names an isolated mediquote_e2e/mediquote_test database.');
}

const db = new PrismaClient({ datasourceUrl: databaseUrl });

const syntheticEconomics: Record<string, string> = {
  costing_overhead_percent: '7.25',
  costing_termination_provision_percent_temp: '2.5',
  commercial_gasi_markup_on_cost_percent: '31',
  commercial_floor_on_cost_percent: '9',
  commercial_buffer_on_cost_percent: '6',
  commercial_commission_floor_percent: '8',
  commercial_commission_intermediate_percent: '9',
  commercial_commission_list_percent: '10',
  commercial_semaphore_green_return_on_cost_percent: '28',
  commercial_semaphore_yellow_return_on_cost_percent: '18',
};

async function main() {
  const maestroPassword = process.env.E2E_MAESTRO_PASSWORD ?? 'E2E-Maestro-Only-2026!';
  const commercialPassword = process.env.E2E_COMMERCIAL_PASSWORD ?? 'E2E-Comercial-Only-2026!';

  const maestro = await db.user.upsert({
    where: { email: 'e2e.maestro@example.invalid' },
    update: {
      name: 'E2E Maestro', role: 'maestro', active: true, mustChangePassword: false,
      password: await hash(maestroPassword, 12),
    },
    create: {
      email: 'e2e.maestro@example.invalid', name: 'E2E Maestro', role: 'maestro', active: true,
      mustChangePassword: false, password: await hash(maestroPassword, 12),
    },
  });

  await db.user.upsert({
    where: { email: 'e2e.comercial@example.invalid' },
    update: {
      name: 'E2E Comercial', role: 'comercial', active: true, mustChangePassword: false,
      password: await hash(commercialPassword, 12), createdById: maestro.id,
    },
    create: {
      email: 'e2e.comercial@example.invalid', name: 'E2E Comercial', role: 'comercial', active: true,
      mustChangePassword: false, password: await hash(commercialPassword, 12), createdById: maestro.id,
    },
  });

  await db.client.upsert({
    where: { id: 'e2e-client-001' },
    update: {
      businessName: 'E2E Cliente Sintético', cif: 'E2E000001', fiscalAddress: 'Dirección sintética de pruebas',
    },
    create: {
      id: 'e2e-client-001', businessName: 'E2E Cliente Sintético', cif: 'E2E000001',
      fiscalAddress: 'Dirección sintética de pruebas', contactPerson: 'Persona Sintética',
      email: 'cliente@example.invalid', phone: '000000000',
    },
  });

  const syntheticCategories = [
    { id: 'e2e-category-nursing', name: 'E2E Enfermería sintética', defaultPricePerHour: 37, defaultInternalCost: 23 },
    { id: 'e2e-category-medicine', name: 'E2E Medicina sintética', defaultPricePerHour: 61, defaultInternalCost: 41 },
  ];
  for (const category of syntheticCategories) {
    await db.professionalCategory.upsert({
      where: { name: category.name },
      update: { active: true, defaultPricePerHour: category.defaultPricePerHour, defaultInternalCost: category.defaultInternalCost },
      create: { ...category, active: true, description: 'Fixture sintético aislado; no representa tarifas reales de GASI.' },
    });
  }

  await db.laborRule.upsert({
    where: { name: 'E2E Regla laboral sintética' },
    update: { maxWeeklyHours: 40, maxDailyHours: 12, minRestBetweenShiftsH: 12, maxConsecutiveDays: 6, nightStartHour: 22, nightEndHour: 6 },
    create: { name: 'E2E Regla laboral sintética', maxWeeklyHours: 40, maxDailyHours: 12, minRestBetweenShiftsH: 12, maxConsecutiveDays: 6, nightStartHour: 22, nightEndHour: 6 },
  });

  for (const [key, value] of Object.entries(syntheticEconomics)) {
    await db.appConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  console.log('E2E synthetic fixture ready in isolated database.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
