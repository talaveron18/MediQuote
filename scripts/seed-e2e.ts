import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import {
  VERIFIED_LABOR_INPUTS_KEY,
  VERIFIED_LABOR_UNITS,
  type VerifiedLaborConcept,
  type VerifiedLaborInputRecord,
} from '../src/lib/costing/verified-labor-inputs';
import type { ContractType } from '../src/lib/costing/cost-types';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const enabled = process.env.MEDIQUOTE_E2E === '1';
const isolatedName = /mediquote_(e2e|test)/i.test(databaseUrl);

if (!enabled || !isolatedName) {
  throw new Error('seed-e2e refuses to run unless MEDIQUOTE_E2E=1 and DATABASE_URL names an isolated mediquote_e2e/mediquote_test database.');
}

function requiredEnv(name: 'E2E_ADMIN_PASSWORD' | 'E2E_MAESTRO_PASSWORD' | 'E2E_COMMERCIAL_PASSWORD'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatoria para sembrar el entorno E2E aislado`);
  return value;
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

const conceptValues: Record<VerifiedLaborConcept, number> = {
  productive_hour_gross: 23,
  management_fee_per_contract: 12,
  annual_convention_hours: 1680,
  annual_productive_hours: 1290,
  ss_common_contingencies_percent: 24,
  ss_unemployment_percent: 6,
  ss_fogasa_percent: 0.2,
  ss_training_percent: 0.6,
  ss_mei_percent: 0.8,
  atep_percent: 1.5,
};

function syntheticVerifiedLaborRecords(): VerifiedLaborInputRecord[] {
  const categoryIds = ['e2e-category-nursing', 'e2e-category-medicine'];
  const territories = ['Madrid', 'Valladolid'];
  const contracts: ContractType[] = ['indefinido', 'temporal', 'fijo_discontinuo', 'mercantil_autonomo'];
  const rows: VerifiedLaborInputRecord[] = [];
  for (const categoryId of categoryIds) {
    for (const territory of territories) {
      for (const contractType of contracts) {
        for (const [conceptKey, value] of Object.entries(conceptValues) as Array<[VerifiedLaborConcept, number]>) {
          rows.push({
            id: `e2e:${categoryId}:${territory}:${contractType}:${conceptKey}`,
            conceptKey,
            categoryId,
            territory,
            contractType,
            value: categoryId === 'e2e-category-medicine' && conceptKey === 'productive_hour_gross' ? 41 : value,
            unit: VERIFIED_LABOR_UNITS[conceptKey],
            effectiveFrom: '2026-01-01',
            effectiveTo: '2026-12-31',
            sourceDocument: 'E2E-GESTORIA-SYNTHETIC-NOT-REAL',
            sourceDate: '2026-01-01',
            notes: 'Fixture sintético aislado; no representa costes reales de GASI.',
            status: 'verified',
            recordedBy: 'e2e-seed',
            recordedAt: '2026-01-01T00:00:00.000Z',
          });
        }
      }
    }
  }
  return rows;
}

async function main() {
  const adminPassword = requiredEnv('E2E_ADMIN_PASSWORD');
  const maestroPassword = requiredEnv('E2E_MAESTRO_PASSWORD');
  const commercialPassword = requiredEnv('E2E_COMMERCIAL_PASSWORD');

  const admin = await db.user.upsert({
    where: { email: 'e2e.admin@example.invalid' },
    update: {
      name: 'E2E Admin', role: 'admin', active: true, mustChangePassword: false,
      password: await hash(adminPassword, 12),
    },
    create: {
      email: 'e2e.admin@example.invalid', name: 'E2E Admin', role: 'admin', active: true,
      mustChangePassword: false, password: await hash(adminPassword, 12),
    },
  });

  const maestro = await db.user.upsert({
    where: { email: 'e2e.maestro@example.invalid' },
    update: {
      name: 'E2E Maestro', role: 'maestro', active: true, mustChangePassword: false,
      password: await hash(maestroPassword, 12), createdById: admin.id,
    },
    create: {
      email: 'e2e.maestro@example.invalid', name: 'E2E Maestro', role: 'maestro', active: true,
      mustChangePassword: false, password: await hash(maestroPassword, 12), createdById: admin.id,
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
    { id: 'e2e-category-nursing', name: 'E2E Enfermería sintética', defaultPricePerHour: 37, defaultInternalCost: 999 },
    { id: 'e2e-category-medicine', name: 'E2E Medicina sintética', defaultPricePerHour: 61, defaultInternalCost: 999 },
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
  await db.appConfig.upsert({
    where: { key: VERIFIED_LABOR_INPUTS_KEY },
    update: { value: JSON.stringify(syntheticVerifiedLaborRecords()) },
    create: { key: VERIFIED_LABOR_INPUTS_KEY, value: JSON.stringify(syntheticVerifiedLaborRecords()) },
  });

  await db.legalParameter.upsert({
    where: { key: 'SMI_ANNUAL_2026' },
    update: { value: '17094', unit: 'EUR/año', category: 'E2E sintético', effectiveFrom: '2026-01-01', isActive: true },
    create: {
      key: 'SMI_ANNUAL_2026', label: 'E2E SMI anual sintético', value: '17094', unit: 'EUR/año',
      category: 'E2E sintético', effectiveFrom: '2026-01-01', isActive: true,
      notes: 'Fixture sintético aislado; no usar como fuente real.',
    },
  });

  console.log('E2E synthetic fixture ready in isolated database.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
