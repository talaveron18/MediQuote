import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { getConnectionString } from '@netlify/database'
import { getHolidaysForDBSeed } from '../src/lib/spanish-holidays'
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from '../src/lib/password-policy'

const datasourceUrl = process.env.DATABASE_URL?.trim() || getConnectionString()
const db = new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined)

const ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  maestro: {
    canManageUsers: true,
    canManageAdmins: true,
    canManageCommercials: true,
    canViewInternalCosts: true,
    canEditPrices: true,
    canEditSurcharges: true,
    canEditLaborRules: true,
    canViewAuditLogs: true,
    canExportAuditPackage: true,
    canManageBranding: true,
    canManageLicense: true,
    canImportRemoteConfig: true,
    canExportRemoteConfig: true,
    canCreateBudgets: true,
    canEditBudgets: true,
    canDeleteBudgets: true,
    canGeneratePDF: true,
    canViewAllBudgets: true,
    canManageBackups: true,
  },
  admin: {
    canManageUsers: true,
    canManageAdmins: false,
    canManageCommercials: true,
    canViewInternalCosts: true,
    canEditPrices: true,
    canEditSurcharges: true,
    canEditLaborRules: true,
    canViewAuditLogs: true,
    canExportAuditPackage: true,
    canManageBranding: false,
    canManageLicense: false,
    canImportRemoteConfig: true,
    canExportRemoteConfig: false,
    canCreateBudgets: true,
    canEditBudgets: true,
    canDeleteBudgets: true,
    canGeneratePDF: true,
    canViewAllBudgets: true,
    canManageBackups: true,
  },
  comercial: {
    canManageUsers: false,
    canManageAdmins: false,
    canManageCommercials: false,
    canViewInternalCosts: false,
    canEditPrices: false,
    canEditSurcharges: false,
    canEditLaborRules: false,
    canViewAuditLogs: false,
    canExportAuditPackage: false,
    canManageBranding: false,
    canManageLicense: false,
    canImportRemoteConfig: true,
    canExportRemoteConfig: false,
    canCreateBudgets: true,
    canEditBudgets: true,
    canDeleteBudgets: false,
    canGeneratePDF: true,
    canViewAllBudgets: false,
    canManageBackups: false,
  },
}

function assertSeedAllowed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CLI seed deshabilitado en producción')
  }
  if (process.env.MEDIQUOTE_ALLOW_SYNTHETIC_SEED !== 'true') {
    throw new Error('CLI seed requiere MEDIQUOTE_ALLOW_SYNTHETIC_SEED=true')
  }
}

async function seedConfiguredUsers() {
  const users = [
    {
      email: 'fernando.suarez@gasisalud.com',
      passwordEnvironmentKey: 'GASI_MAESTRO_INITIAL_PASSWORD',
      name: 'Fernando Suárez',
      role: 'maestro',
    },
    {
      email: 'alex@gasisalud.com',
      passwordEnvironmentKey: 'GASI_ADMIN_INITIAL_PASSWORD',
      name: 'Alex',
      role: 'admin',
    },
    {
      email: 'comercial@gasisalud.com',
      passwordEnvironmentKey: 'GASI_COMMERCIAL_INITIAL_PASSWORD',
      name: 'Comercial',
      role: 'comercial',
    },
  ]

  for (const user of users) {
    const existing = await db.user.findUnique({ where: { email: user.email } })
    if (existing) {
      console.log(`  User exists: ${user.email}`)
      continue
    }

    const configuredPassword = process.env[user.passwordEnvironmentKey]?.trim()
    if (!configuredPassword) {
      console.log(`  User skipped: ${user.email}; protected environment secret not configured`)
      continue
    }
    if (!isStrongEnoughPassword(configuredPassword)) {
      throw new Error(
        `${user.passwordEnvironmentKey} debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres`,
      )
    }

    const createData: {
      email: string
      name: string
      role: string
      mustChangePassword: boolean
      permissions: string
      password: string
      createdById?: string
    } = {
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: true,
      permissions: JSON.stringify(ROLE_PERMISSIONS[user.role]),
      password: await hash(configuredPassword, 12),
    }

    if (user.role !== 'maestro') {
      const maestro = await db.user.findFirst({ where: { role: 'maestro' }, select: { id: true } })
      if (maestro) createData.createdById = maestro.id
    }

    await db.user.create({ data: createData })
    console.log(`  User created: ${user.email} (${user.role})`)
  }
}

async function seedHolidays() {
  const holidays = getHolidaysForDBSeed()
  let created = 0
  for (const holiday of holidays) {
    const existing = await db.holiday.findFirst({
      where: { date: holiday.date, name: holiday.name },
    })
    if (!existing) {
      await db.holiday.create({ data: holiday })
      created += 1
    }
  }
  console.log(`  Holidays: ${created} created, ${holidays.length - created} already existed`)
}

async function seedNonEconomicAppConfig() {
  const appConfigs: { key: string; value: string }[] = [
    { key: 'company_name', value: 'GASI — Grupo de Asistencia Sanitaria Integral' },
    { key: 'company_cif', value: '' },
    { key: 'company_address', value: '' },
    { key: 'company_phone', value: '622 822 101' },
    { key: 'company_email', value: 'coordinacion@gasisalud.com' },
    { key: 'calculationEngineVersion', value: '2.0.0' },
    { key: 'appMinVersion', value: '1.0.0' },
    { key: 'instanceName', value: 'GASI' },
    { key: 'productName', value: 'MediQuote Pro' },
    { key: 'visibleToolName', value: 'Presupuestos Sanitarios' },
    { key: 'licenseHolder', value: 'Fernando Javier Suárez Talaverón' },
    { key: 'licenseText', value: 'Bajo licencia habilitada de MediQuote Pro' },
    { key: 'internalUseText', value: 'Uso interno autorizado para GASI' },
    { key: 'copyrightText', value: '© 2026 Fernando Javier Suárez Talaverón. MediQuote Pro. Todos los derechos reservados.' },
    { key: 'pdfFooterText', value: 'Documento generado mediante MediQuote Pro bajo licencia interna habilitada para GASI.' },
  ]

  for (const config of appConfigs) {
    const existing = await db.appConfig.findUnique({ where: { key: config.key } })
    if (!existing) {
      await db.appConfig.create({ data: config })
      console.log(`  AppConfig created: ${config.key}`)
    }
  }
}

export async function seedDatabase() {
  assertSeedAllowed()
  console.log('Seeding non-economic bootstrap data...')
  await seedConfiguredUsers()
  await seedHolidays()
  await seedNonEconomicAppConfig()
  console.log('Seed completed without economic, labor, surcharge, legal-parameter or client fixtures.')
}

const directRun = process.argv[1]?.replace(/\\/g, '/').endsWith('/scripts/seed.ts')
if (directRun) {
  seedDatabase()
    .catch((error) => {
      console.error('Seed error:', error instanceof Error ? error.message : 'unknown error')
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
