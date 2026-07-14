import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { getHolidaysForDBSeed } from '../src/lib/spanish-holidays'

const db = new PrismaClient()

// Default permissions per role
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

async function main() {
  console.log('Seeding database...\n')

  const users = [
    {
      email: 'fernando.suarez@gasisalud.com',
      password: await hash('Cambiar1234!', 12),
      name: 'Fernando Suárez',
      role: 'maestro',
      mustChangePassword: true,
      permissions: JSON.stringify(ROLE_PERMISSIONS.maestro),
    },
    {
      email: 'alex@gasisalud.com',
      password: await hash('Cambiar1234!', 12),
      name: 'Alex',
      role: 'admin',
      mustChangePassword: true,
      permissions: JSON.stringify(ROLE_PERMISSIONS.admin),
    },
    {
      email: 'comercial@gasisalud.com',
      password: await hash('Cambiar1234!', 12),
      name: 'Comercial Demo',
      role: 'comercial',
      mustChangePassword: true,
      permissions: JSON.stringify(ROLE_PERMISSIONS.comercial),
    },
  ]

  for (const u of users) {
    const existing = await db.user.findUnique({ where: { email: u.email } })
    if (!existing) {
      const createData: any = { ...u }
      if (u.role !== 'maestro') {
        const maestro = await db.user.findFirst({ where: { role: 'maestro' } })
        if (maestro) createData.createdById = maestro.id
      }
      await db.user.create({ data: createData })
      console.log(`  User created: ${u.email} (${u.role})`)
    } else {
      console.log(`  User exists:  ${u.email}`)
    }
  }

  const categories = [
    { name: 'Médico', defaultPricePerHour: 35, defaultInternalCost: 22 },
    { name: 'Enfermero', defaultPricePerHour: 22, defaultInternalCost: 14 },
    { name: 'TCAE', defaultPricePerHour: 14, defaultInternalCost: 9 },
    { name: 'Auxiliar Administrativo', defaultPricePerHour: 12, defaultInternalCost: 8 },
    { name: 'Fisioterapeuta', defaultPricePerHour: 28, defaultInternalCost: 18 },
    { name: 'Psicólogo', defaultPricePerHour: 30, defaultInternalCost: 20 },
    { name: 'Matrona', defaultPricePerHour: 32, defaultInternalCost: 20 },
  ]

  for (const c of categories) {
    const existing = await db.professionalCategory.findUnique({ where: { name: c.name } })
    if (!existing) {
      await db.professionalCategory.create({ data: c })
      console.log(`  Category created: ${c.name}`)
    } else {
      console.log(`  Category exists:  ${c.name}`)
    }
  }

  const surcharges = [
    { name: 'Nocturnidad', type: 'nocturnidad', surchargeType: 'percentage', value: 25 },
    { name: 'Domingo', type: 'domingo', surchargeType: 'percentage', value: 50 },
    { name: 'Festivo Nacional', type: 'festivo_nacional', surchargeType: 'percentage', value: 75 },
    { name: 'Festivo Autonómico', type: 'festivo_autonomico', surchargeType: 'percentage', value: 50 },
    { name: 'Fin de Semana', type: 'fin_de_semana', surchargeType: 'percentage', value: 30 },
    { name: 'Urgencia', type: 'urgencia', surchargeType: 'percentage', value: 40 },
    { name: 'Desplazamiento', type: 'desplazamiento', surchargeType: 'fixed', value: 15 },
    { name: 'Difícil Cobertura', type: 'dificil_cobertura', surchargeType: 'percentage', value: 20 },
    { name: 'Festivo Provincial', type: 'festivo_provincial', surchargeType: 'percentage', value: 30 },
    { name: 'Festivo Municipal', type: 'festivo_municipal', surchargeType: 'percentage', value: 20 },
  ]

  for (const s of surcharges) {
    const existing = await db.surchargeConfig.findUnique({ where: { name: s.name } })
    if (!existing) {
      await db.surchargeConfig.create({ data: s })
      console.log(`  Surcharge created: ${s.name}`)
    } else {
      console.log(`  Surcharge exists:  ${s.name}`)
    }
  }

  const existingRule = await db.laborRule.findUnique({ where: { name: 'Regla General 40h' } })
  if (!existingRule) {
    await db.laborRule.create({
      data: {
        name: 'Regla General 40h',
        maxWeeklyHours: 40,
        maxDailyHours: 12,
        minRestBetweenShiftsH: 12,
        maxConsecutiveDays: 6,
        nightStartHour: 22,
        nightEndHour: 6,
      },
    })
    console.log('  Labor rule created: Regla General 40h')
  } else {
    console.log('  Labor rule exists:  Regla General 40h')
  }

  const holidays = getHolidaysForDBSeed()
  let createdHolidays = 0
  for (const h of holidays) {
    const existing = await db.holiday.findFirst({ where: { date: h.date, name: h.name } })
    if (!existing) {
      await db.holiday.create({ data: h })
      createdHolidays++
    }
  }
  console.log(`  Holidays: ${createdHolidays} created, ${holidays.length - createdHolidays} already existed`)

  const appConfigs: { key: string; value: string }[] = [
    { key: 'company_name', value: 'GASI' },
    { key: 'company_cif', value: 'B12345678' },
    { key: 'ivaPercent', value: '21' },
    { key: 'maxDiscountPercent', value: '15' },
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

  for (const cfg of appConfigs) {
    await db.appConfig.upsert({ where: { key: cfg.key }, update: { value: cfg.value }, create: cfg })
    console.log(`  AppConfig: ${cfg.key} = ${cfg.value}`)
  }

  const existingClient = await db.client.findFirst({ where: { cif: 'B12345678' } })
  if (!existingClient) {
    await db.client.create({ data: { businessName: 'Clínica San Miguel', cif: 'B12345678', fiscalAddress: 'Calle Mayor 15, Madrid' } })
    console.log('  Client created: Clínica San Miguel')
  } else {
    console.log('  Client exists:  Clínica San Miguel')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
