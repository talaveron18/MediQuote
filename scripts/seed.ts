import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { getHolidaysForDBSeed } from '../src/lib/spanish-holidays'
import { generateTemporaryPassword } from '../src/lib/password'
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from '../src/lib/password-policy'
import { getConnectionString } from '@netlify/database'

const datasourceUrl = process.env.DATABASE_URL?.trim()
  || getConnectionString()
const db = new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined)

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

export async function seedDatabase() {
  console.log('Seeding database...\n')

  // ─── Users ────────────────────────────────────────────────
  const users = [
    {
      email: 'fernando.suarez@gasisalud.com',
      passwordEnvironmentKey: 'GASI_MAESTRO_INITIAL_PASSWORD',
      name: 'Fernando Suárez',
      role: 'maestro',
      mustChangePassword: true,
      permissions: JSON.stringify(ROLE_PERMISSIONS.maestro),
    },
    {
      email: 'alex@gasisalud.com',
      passwordEnvironmentKey: 'GASI_ADMIN_INITIAL_PASSWORD',
      name: 'Alex',
      role: 'admin',
      mustChangePassword: true,
      permissions: JSON.stringify(ROLE_PERMISSIONS.admin),
    },
    {
      email: 'comercial@gasisalud.com',
      passwordEnvironmentKey: 'GASI_COMMERCIAL_INITIAL_PASSWORD',
      name: 'Comercial Demo',
      role: 'comercial',
      mustChangePassword: true,
      permissions: JSON.stringify(ROLE_PERMISSIONS.comercial),
    },
  ]

  // Create maestro first (no createdById)
  for (const u of users) {
    const existing = await db.user.findUnique({ where: { email: u.email } })
    if (!existing) {
      const configuredPassword = process.env[u.passwordEnvironmentKey]?.trim()
      const initialPassword = configuredPassword || generateTemporaryPassword()
      if (!isStrongEnoughPassword(initialPassword)) {
        throw new Error(
          `${u.passwordEnvironmentKey} debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres`,
        )
      }
      const createData: any = {
        email: u.email,
        name: u.name,
        role: u.role,
        mustChangePassword: u.mustChangePassword,
        permissions: u.permissions,
        password: await hash(initialPassword, 12),
      }
      if (u.role !== 'maestro') {
        // Set createdById to maestro
        const maestro = await db.user.findFirst({ where: { role: 'maestro' } })
        if (maestro) createData.createdById = maestro.id
      }
      await db.user.create({ data: createData })
      console.log(`  User created: ${u.email} (${u.role})`)
      if (!configuredPassword) {
        console.log(`  Temporary password for ${u.email}: ${initialPassword}`)
      }
    } else {
      console.log(`  User exists:  ${u.email}`)
    }
  }

  // ─── Categories ──────────────────────────────────────────
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

  // ─── Surcharges ──────────────────────────────────────────
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

  // ─── Labor Rule ──────────────────────────────────────────
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
    if (existingRule.minRestBetweenShiftsH < 12) {
      await db.laborRule.update({
        where: { id: existingRule.id },
        data: { minRestBetweenShiftsH: 12 },
      })
      console.log('  Labor rule updated: minimum rest set to 12h')
    }
    console.log('  Labor rule exists:  Regla General 40h')
  }

  // ─── Holidays ────────────────────────────────────────────
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

  // ─── App Config ──────────────────────────────────────────
  const appConfigs: { key: string; value: string }[] = [
    { key: 'company_name', value: 'GASI — Grupo de Asistencia Sanitaria Integral' },
    { key: 'company_cif', value: '' },
    { key: 'company_address', value: '' },
    { key: 'company_phone', value: '622 822 101' },
    { key: 'company_email', value: 'coordinacion@gasisalud.com' },
    { key: 'ivaPercent', value: '21' },
    { key: 'maxDiscountPercent', value: '15' },
    { key: 'calculationEngineVersion', value: '2.0.0' },
    { key: 'costing_province', value: 'Madrid' },
    { key: 'costing_overhead_percent', value: '15' },
    { key: 'costing_management_fee_per_contract', value: '15' },
    { key: 'appMinVersion', value: '1.0.0' },
    { key: 'instanceName', value: 'GASI' },
    { key: 'productName', value: 'MediQuote Pro' },
    { key: 'visibleToolName', value: 'Presupuestos Sanitarios' },
    { key: 'licenseHolder', value: 'Fernando Javier Suárez Talaverón' },
    { key: 'licenseText', value: 'Bajo licencia habilitada de MediQuote Pro' },
    { key: 'internalUseText', value: 'Uso interno autorizado para GASI' },
    { key: 'copyrightText', value: '\u00a9 2026 Fernando Javier Suárez Talaverón. MediQuote Pro. Todos los derechos reservados.' },
    { key: 'pdfFooterText', value: 'Documento generado mediante MediQuote Pro bajo licencia interna habilitada para GASI.' },
  ]

  for (const cfg of appConfigs) {
    const existing = await db.appConfig.findUnique({ where: { key: cfg.key } })
    if (!existing) await db.appConfig.create({ data: cfg })
    else if (cfg.key === 'company_cif' && existing.value === 'B12345678') {
      await db.appConfig.update({ where: { key: cfg.key }, data: { value: '' } })
    } else if (cfg.key === 'company_name' && existing.value === 'GASI') {
      await db.appConfig.update({ where: { key: cfg.key }, data: { value: cfg.value } })
    }
    console.log(`  AppConfig: ${cfg.key} = ${cfg.value}`)
  }

  // ─── Client ──────────────────────────────────────────────
  const existingClient = await db.client.findFirst({ where: { cif: 'B12345678' } })
  if (!existingClient) {
    await db.client.create({
      data: {
        businessName: 'Clínica San Miguel',
        cif: 'B12345678',
        fiscalAddress: 'Calle Mayor 15, Madrid',
      },
    })
    console.log('  Client created: Clínica San Miguel')
  } else {
    console.log('  Client exists:  Clínica San Miguel')
  }

  // ── Legal Records & Parameters ───────────────────────────────
  console.log('\n── Legal Records ──')

  const LEGAL_RECORDS_SEED = [
    {
      key: "smi_2026",
      title: "SMI 2026 — 1.221 €/mes",
      category: "Salario mínimo",
      normName: "Real Decreto 126/2026, de 18 de febrero",
      legalLocation: "Artículo 1",
      officialReference: "BOE-A-2026-3815",
      eliUrl: "https://www.boe.es/eli/es/rd/2026/02/18/126",
      officialUrl: "https://www.boe.es/buscar/doc.php?id=BOE-A-2026-3815",
      literalQuote: "En lo que respecta al salario mínimo interprofesional, es de aplicación lo establecido en el Real Decreto 126/2026, de 18 de febrero.",
      quoteSource: "Orden PJC/297/2026 (remisión literal). Importe del art. 1 RD 126/2026.",
      operativeSummary: "SMI 2026: 40,70 €/día o 1.221 €/mes en 14 pagas = 17.094 €/año brutos. Efectos del 1 de enero al 31 de diciembre de 2026.",
      reviewedAt: "2026-06-24",
      status: "vigente",
      hasLiteralQuote: true
    },
    {
      key: "cotiz_cc",
      title: "Contingencias comunes — 23,60 % empresa",
      category: "Cotización SS 2026",
      normName: "Orden PJC/297/2026, de 30 de marzo",
      legalLocation: "Tipos de cotización",
      officialReference: "BOE-A-2026-7296",
      eliUrl: "https://www.boe.es/eli/es/o/2026/03/30/pjc297",
      officialUrl: "https://www.boe.es/buscar/act.php?id=BOE-A-2026-7296",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Contingencias comunes 28,30 %: 23,60 % empresa y 4,70 % trabajador.",
      reviewedAt: "2026-06-24",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "cotiz_desempleo",
      title: "Desempleo — 5,50 % / 6,70 % empresa",
      category: "Cotización SS 2026",
      normName: "Orden PJC/297/2026, de 30 de marzo",
      legalLocation: "Cotización por desempleo",
      officialReference: "BOE-A-2026-7296",
      eliUrl: "https://www.boe.es/eli/es/o/2026/03/30/pjc297",
      officialUrl: "https://www.boe.es/buscar/act.php?id=BOE-A-2026-7296",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Indefinidos 7,05 %: 5,50 % empresa + 1,55 % trabajador. Duración determinada 8,30 %: 6,70 % empresa + 1,60 % trabajador.",
      reviewedAt: "2026-06-24",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "cotiz_mei",
      title: "MEI 2026 — 0,75 % empresa",
      category: "Cotización SS 2026",
      normName: "Orden PJC/297/2026, de 30 de marzo",
      legalLocation: "Mecanismo de Equidad Intergeneracional",
      officialReference: "BOE-A-2026-7296",
      eliUrl: "https://www.boe.es/eli/es/o/2026/03/30/pjc297",
      officialUrl: "https://www.boe.es/buscar/act.php?id=BOE-A-2026-7296",
      literalQuote: "Desde el 1 de enero de 2026, la cotización adicional correspondiente al mecanismo de equidad intergeneracional en el Régimen General de la Seguridad Social se determinará aplicando el tipo del 0,90 por ciento sobre la base de cotización por contingencias comunes, del que el 0,75 por ciento será a cargo del empleador y el 0,15 por ciento, a cargo de la persona trabajadora.",
      quoteSource: "Texto literal de la Orden PJC/297/2026 (BOE-A-2026-7296).",
      operativeSummary: "MEI 0,90 %: 0,75 % empresa, 0,15 % trabajador. Sube 0,1 puntos cada año.",
      reviewedAt: "2026-06-24",
      status: "vigente",
      hasLiteralQuote: true
    },
    {
      key: "cotiz_otros",
      title: "FOGASA 0,20 % · Formación 0,60 % empresa",
      category: "Cotización SS 2026",
      normName: "Orden PJC/297/2026, de 30 de marzo",
      legalLocation: "FOGASA y formación profesional",
      officialReference: "BOE-A-2026-7296",
      eliUrl: "https://www.boe.es/eli/es/o/2026/03/30/pjc297",
      officialUrl: "https://www.boe.es/buscar/act.php?id=BOE-A-2026-7296",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "FOGASA 0,20 % empresa. Formación profesional 0,70 % total: 0,60 % empresa, 0,10 % trabajador.",
      reviewedAt: "2026-06-24",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "atep",
      title: "AT/EP — tarifa de primas editable",
      category: "Cotización SS 2026",
      normName: "Orden PJC/297/2026 · LGSS disp. ad. 61ª",
      legalLocation: "Accidentes de trabajo y enfermedades profesionales",
      officialReference: "BOE-A-2026-7296",
      eliUrl: "https://www.boe.es/eli/es/o/2026/03/30/pjc297",
      officialUrl: "https://www.boe.es/buscar/act.php?id=BOE-A-2026-7296",
      literalQuote: "En materia de accidentes de trabajo y enfermedades profesionales, para las personas trabajadoras por cuenta ajena, será de aplicación la tarifa de primas establecida en la disposición adicional sexagésima primera del texto refundido de la Ley General de la Seguridad Social, introducida por la disposición final primera del Real Decreto-ley 3/2026, de 3 de febrero.",
      quoteSource: "Texto literal de la Orden PJC/297/2026 (BOE-A-2026-7296).",
      operativeSummary: "A cargo exclusivo de la empresa. El tipo depende del CNAE de la actividad. 1,50 % es valor medio sanitario orientativo: confirmar con gestoría.",
      reviewedAt: "2026-06-24",
      status: "validar_con_asesoria",
      hasLiteralQuote: true
    },
    {
      key: "iva_exento",
      title: "IVA exento — asistencia sanitaria",
      category: "IVA",
      normName: "Ley 37/1992 del IVA",
      legalLocation: "Art. 20.Uno.3º",
      officialReference: "BOE-A-1992-28740",
      eliUrl: "https://www.boe.es/eli/es/l/1992/12/28/37",
      officialUrl: "https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Exenta la asistencia a personas físicas por profesionales médicos o sanitarios en diagnóstico, prevención y tratamiento. Depende del servicio concreto, no solo del perfil.",
      reviewedAt: "2026-06-24",
      status: "validar_con_asesoria",
      hasLiteralQuote: false
    },
    {
      key: "iva_general",
      title: "IVA 21 % — servicios no exentos",
      category: "IVA",
      normName: "Ley 37/1992 del IVA",
      legalLocation: "Art. 90",
      officialReference: "BOE-A-1992-28740",
      eliUrl: "https://www.boe.es/eli/es/l/1992/12/28/37",
      officialUrl: "https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Tipo general 21 % cuando no concurre exención sanitaria.",
      reviewedAt: "2026-06-24",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "contrato_fd",
      title: "Fijo-discontinuo (indefinido)",
      category: "Contratos",
      normName: "Estatuto de los Trabajadores (RDL 2/2015), art. 16 · reforma RDL 32/2021",
      legalLocation: "Art. 16 ET",
      officialReference: "BOE-A-2015-11430",
      eliUrl: "https://www.boe.es/eli/es/rdlg/2015/10/23/2",
      officialUrl: "https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Modalidad para trabajos estacionales o intermitentes. Es indefinido: cotiza desempleo al tipo de indefinido, 5,50 % empresa.",
      reviewedAt: "2026-06-24",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "contrato_indef",
      title: "Indefinido — regla general",
      category: "Contratos",
      normName: "Estatuto de los Trabajadores (RDL 2/2015), art. 15 · reforma RDL 32/2021",
      legalLocation: "Art. 15 ET",
      officialReference: "BOE-A-2015-11430",
      eliUrl: "https://www.boe.es/eli/es/rdlg/2015/10/23/2",
      officialUrl: "https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "El contrato se presume por tiempo indefinido. La temporalidad es excepcional y exige causa válida.",
      reviewedAt: "2026-06-24",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "contrato_temp",
      title: "Temporal — solo con causa",
      category: "Contratos",
      normName: "Estatuto de los Trabajadores (RDL 2/2015), art. 15 · reforma RDL 32/2021",
      legalLocation: "Art. 15 ET",
      officialReference: "BOE-A-2021-21788",
      eliUrl: "https://www.boe.es/eli/es/rdl/2021/12/28/32",
      officialUrl: "https://www.boe.es/buscar/act.php?id=BOE-A-2021-21788",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Solo por circunstancias de la producción o sustitución. Sin causa real, el contrato se considera indefinido. Validar con asesoría laboral.",
      reviewedAt: "2026-06-24",
      status: "validar_con_asesoria",
      hasLiteralQuote: false
    },
    {
      key: "competencia",
      title: "Descuentos — no engañosos",
      category: "Comercial",
      normName: "Ley 3/1991 de Competencia Desleal",
      legalLocation: "Art. 5",
      officialReference: "BOE-A-1991-628",
      eliUrl: "https://www.boe.es/eli/es/l/1991/01/10/3",
      officialUrl: "https://www.boe.es/buscar/act.php?id=BOE-A-1991-628",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "El precio catálogo debe ser real y cobrable; el descuento solo debe mostrarse con causa real y registrada.",
      reviewedAt: "2026-06-24",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "conv_madrid",
      title: "Convenio sanidad privada Madrid 2023-2026",
      category: "Convenios salariales",
      normName: "Convenio colectivo de establecimientos sanitarios de la Comunidad de Madrid",
      legalLocation: "Tablas salariales",
      officialReference: "BOCM 279/2023",
      eliUrl: "",
      officialUrl: "https://www.bocm.es/boletin/CM_Orden_BOCM/2023/11/23/BOCM-20231123-25.PDF",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Tablas 2023-2026, jornada 1.680 h/año. El art. 12.3 fija el plus de nocturnidad en el 25%.",
      reviewedAt: "2026-06-24",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "conv_burgos_extension",
      title: "Hospitalización y asistencia privada de Burgos y extensión a Ávila, Segovia y Soria",
      category: "Convenios salariales",
      normName: "Convenio colectivo provincial de hospitalización y asistencia privada de Burgos",
      legalLocation: "Arts. 12, 24 y 25",
      officialReference: "Código de convenio 09000265011981",
      eliUrl: "",
      officialUrl: "https://www.faeburgos.org/wp-content/uploads/2022/10/Hospitalizacion-y-asistencia-privada-de-la-provincia-de-Burgos-09000265011981.pdf",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Extensión vigente para CNAE 8690 en Ávila, Segovia y Soria. Jornada general 1.728 h; se usa 1.705 h como hipótesis conservadora hospitalaria. Nocturnidad 25%; 38,70 €/festivo y 21,74 €/domingo (tablas 2025, ultraactividad).",
      reviewedAt: "2026-07-16",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "conv_leon",
      title: "Establecimientos y centros sanitarios de León",
      category: "Convenios salariales",
      normName: "Convenio colectivo de establecimientos y centros sanitarios de hospitalización, asistencia, consulta y laboratorios de León",
      legalLocation: "Arts. 17 y 22",
      officialReference: "Código 24000805011987",
      eliUrl: "",
      officialUrl: "https://ccoo.app/convenio/convenio-colectivo-est-y-centros-sanitarios-de-hospitaliz-asistencia-consulta-y-laboratorios-de-leon/",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Jornada 1.800 h/año. Nocturnidad del 50% del salario base. Convenio 2022-2025 mantenido por ultraactividad mientras se publica el siguiente.",
      reviewedAt: "2026-07-16",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "conv_palencia",
      title: "Servicios sanitarios y sociosanitarios privados de Palencia",
      category: "Convenios salariales",
      normName: "Convenio colectivo del sector de servicios sanitarios y sociosanitarios privados de Palencia",
      legalLocation: "Jornada y pluses 2025",
      officialReference: "Código 34000965012006",
      eliUrl: "",
      officialUrl: "https://noticias.juridicas.com/base_datos/Laboral/824298-convenio-colectivo-de-trabajo-del-sector-servicios-sanitarios-y-sociosanitarios.html",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Jornada 1.729 h/año. Plus mensual de nocturnidad prorrateado por hora y pluses de domingo/festivo conforme a tablas 2025; ultraactividad tras 31/12/2025.",
      reviewedAt: "2026-07-16",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "conv_salamanca_clm",
      title: "II Convenio de sanidad privada de Salamanca, extendido a Castilla-La Mancha",
      category: "Convenios salariales",
      normName: "II Convenio colectivo de la sanidad privada de Salamanca y extensión a Albacete, Ciudad Real, Cuenca, Guadalajara y Toledo",
      legalLocation: "Arts. 9, 25 y 26; Resolución de extensión de 19/05/2025",
      officialReference: "Código 37101315012020",
      eliUrl: "",
      officialUrl: "https://ccoo.app/convenio/convenio-colectivo-hospitalizacion-y-asistencia-privada-de-cuenca-de-cuenca/",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Aplicable a CNAE 8690 en las cinco provincias de Castilla-La Mancha. Jornada 1.779 h; nocturnidad 11,15 €/noche, domingo/festivo 13,90 € y especial 30 €.",
      reviewedAt: "2026-07-16",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "conv_valladolid",
      title: "Sanidad privada de Valladolid",
      category: "Convenios salariales",
      normName: "Convenio colectivo de sanidad privada de Valladolid",
      legalLocation: "Arts. 10 y 25",
      officialReference: "Código 47001095012003 · BOP Valladolid 185/2021",
      eliUrl: "",
      officialUrl: "https://ccoo.app/convenio/convenio-colectivo-sanidad-privada-de-valladolid/",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Jornada 1.744 h en 2025. Nocturnidad proporcional (10,51 €/10 h), festivo/domingo 14,72 € y especial 29,43 €; ultraactividad.",
      reviewedAt: "2026-07-16",
      status: "vigente",
      hasLiteralQuote: false
    },
    {
      key: "conv_zamora",
      title: "Hospitalización y asistencia privada de Zamora 2022-2026",
      category: "Convenios salariales",
      normName: "Convenio colectivo de hospitalización y asistencia privada / sanidad privada de Zamora",
      legalLocation: "Arts. 10, 20 y 21",
      officialReference: "Código 49100025012013 · BOP Zamora 107/2022",
      eliUrl: "",
      officialUrl: "https://ccoo.app/convenio/convenio-colectivo-hospitalizacion-y-asistencia-privada-sanidad-privada-de-zamora/",
      literalQuote: "",
      quoteSource: "",
      operativeSummary: "Jornada 1.770 h en 2026. Nocturnidad 9,31 €/10 h, festivo/domingo 13,79 € y festivo especial 27,59 €.",
      reviewedAt: "2026-07-16",
      status: "vigente",
      hasLiteralQuote: false
    }
  ]

  for (const lr of LEGAL_RECORDS_SEED) {
    await db.legalRecord.upsert({
      where: { key: lr.key },
      update: {
        title: lr.title,
        category: lr.category,
        norm: lr.normName,
        location: lr.legalLocation,
        reference: lr.officialReference,
        eliUrl: lr.eliUrl || null,
        officialUrl: lr.officialUrl || null,
        literalQuote: lr.literalQuote || null,
        quoteSource: lr.quoteSource || null,
        operativeSummary: lr.operativeSummary,
        reviewDate: lr.reviewedAt,
        status: lr.status,
        hasLiteralQuote: lr.hasLiteralQuote,
        isActive: true,
      },
      create: {
        key: lr.key,
        title: lr.title,
        category: lr.category,
        norm: lr.normName,
        location: lr.legalLocation,
        reference: lr.officialReference,
        eliUrl: lr.eliUrl || null,
        officialUrl: lr.officialUrl || null,
        literalQuote: lr.literalQuote || null,
        quoteSource: lr.quoteSource || null,
        operativeSummary: lr.operativeSummary,
        reviewDate: lr.reviewedAt,
        status: lr.status,
        hasLiteralQuote: lr.hasLiteralQuote,
        sourceType: 'boe',
        isActive: true,
      },
    })
    console.log(`  Legal Record upserted: ${lr.key}`)
  }

  // ── Legal Parameters ─────────────────────────────────────────
  console.log('\n── Legal Parameters ──')

  // Helper to find record by key
  async function getRecordByKey(legalKey: string): Promise<string | null> {
    const r = await db.legalRecord.findUnique({ where: { key: legalKey }, select: { id: true } })
    return r?.id ?? null
  }

  const LEGAL_PARAMETERS_SEED = [
    { key: "SMI_MONTHLY_2026", label: "SMI mensual 2026", value: 1221, unit: "€/mes", category: "Salario mínimo", legalKey: "smi_2026" },
    { key: "SMI_DAILY_2026", label: "SMI diario 2026", value: 40.70, unit: "€/día", category: "Salario mínimo", legalKey: "smi_2026" },
    { key: "SMI_ANNUAL_2026", label: "SMI anual 2026", value: 17094, unit: "€/año", category: "Salario mínimo", legalKey: "smi_2026" },
    { key: "SS_CC_EMPRESA", label: "Contingencias comunes empresa", value: 23.6, unit: "%", category: "Seguridad Social empresa", legalKey: "cotiz_cc" },
    { key: "SS_DESEMPLEO_INDEFINIDO_EMPRESA", label: "Desempleo indefinido empresa", value: 5.5, unit: "%", category: "Seguridad Social empresa", legalKey: "cotiz_desempleo" },
    { key: "SS_DESEMPLEO_TEMPORAL_EMPRESA", label: "Desempleo temporal empresa", value: 6.7, unit: "%", category: "Seguridad Social empresa", legalKey: "cotiz_desempleo" },
    { key: "SS_FOGASA_EMPRESA", label: "FOGASA empresa", value: 0.2, unit: "%", category: "Seguridad Social empresa", legalKey: "cotiz_otros" },
    { key: "SS_FORMACION_EMPRESA", label: "Formación profesional empresa", value: 0.6, unit: "%", category: "Seguridad Social empresa", legalKey: "cotiz_otros" },
    { key: "SS_MEI_EMPRESA_2026", label: "MEI empresa 2026", value: 0.75, unit: "%", category: "Seguridad Social empresa", legalKey: "cotiz_mei" },
    { key: "SS_ATEP_ORIENTATIVO", label: "AT/EP orientativo", value: 1.5, unit: "%", category: "Seguridad Social empresa", legalKey: "atep" },
    { key: "IVA_GENERAL", label: "IVA general", value: 21, unit: "%", category: "IVA", legalKey: "iva_general" },
    { key: "IVA_EXENTO_SANITARIO", label: "IVA exento asistencia sanitaria", value: 0, unit: "%", category: "IVA", legalKey: "iva_exento" },
    { key: "JORNADA_MADRID_ANUAL", label: "Jornada anual Madrid", value: 1680, unit: "h/año", category: "Convenios", legalKey: "conv_madrid" },
    { key: "HORAS_FACTURABLES_MADRID", label: "Horas productivas Madrid estimadas", value: 1293, unit: "h/año", category: "Convenios", legalKey: "conv_madrid" },
    { key: "PLUS_NOCTURNIDAD_MADRID", label: "Plus nocturnidad Madrid", value: 25, unit: "%", category: "Convenios salariales", legalKey: "conv_madrid" },
    { key: "PLUS_FESTIVO_MADRID", label: "Plus festivo ordinario Madrid", value: 12, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_madrid" },
    { key: "PLUS_FESTIVO_ESPECIAL_MADRID", label: "Plus 25 diciembre / 1 enero Madrid", value: 38, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_madrid" },
    { key: "SIN_PLUS_DOMINGO_MADRID", label: "Sin plus específico de domingo Madrid", value: 0, unit: "€/h", category: "Convenios salariales", legalKey: "conv_madrid" },
    { key: "SIN_PLUS_SABADO_MADRID", label: "Sin plus específico de sábado Madrid", value: 0, unit: "€/h", category: "Convenios salariales", legalKey: "conv_madrid" },

    { key: "JORNADA_BURGOS_ANUAL", label: "Jornada anual Burgos/extensión (hipótesis hospitalaria conservadora)", value: 1705, unit: "h/año", category: "Convenios", legalKey: "conv_burgos_extension" },
    { key: "HORAS_FACTURABLES_BURGOS", label: "Horas productivas Burgos/extensión estimadas", value: 1312, unit: "h/año", category: "Convenios", legalKey: "conv_burgos_extension" },
    { key: "PLUS_NOCTURNIDAD_BURGOS", label: "Plus nocturnidad Burgos/extensión", value: 25, unit: "%", category: "Convenios salariales", legalKey: "conv_burgos_extension" },
    { key: "PLUS_DOMINGO_BURGOS", label: "Plus domingo Burgos/extensión 2025", value: 21.74, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_burgos_extension" },
    { key: "PLUS_FESTIVO_BURGOS", label: "Plus festivo Burgos/extensión 2025", value: 38.70, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_burgos_extension" },
    { key: "SIN_PLUS_SABADO_BURGOS", label: "Sin plus específico de sábado Burgos/extensión", value: 0, unit: "€/h", category: "Convenios salariales", legalKey: "conv_burgos_extension" },

    { key: "JORNADA_LEON_ANUAL", label: "Jornada anual León", value: 1800, unit: "h/año", category: "Convenios", legalKey: "conv_leon" },
    { key: "HORAS_FACTURABLES_LEON", label: "Horas productivas León estimadas", value: 1385, unit: "h/año", category: "Convenios", legalKey: "conv_leon" },
    { key: "PLUS_NOCTURNIDAD_LEON", label: "Plus nocturnidad León", value: 50, unit: "%", category: "Convenios salariales", legalKey: "conv_leon" },
    { key: "SIN_PLUS_DOMINGO_LEON", label: "Sin plus específico de domingo León", value: 0, unit: "€/h", category: "Convenios salariales", legalKey: "conv_leon" },
    { key: "SIN_PLUS_SABADO_LEON", label: "Sin plus específico de sábado León", value: 0, unit: "€/h", category: "Convenios salariales", legalKey: "conv_leon" },
    { key: "SIN_PLUS_FESTIVO_LEON", label: "Sin plus específico de festivo León", value: 0, unit: "€/h", category: "Convenios salariales", legalKey: "conv_leon" },

    { key: "JORNADA_PALENCIA_ANUAL", label: "Jornada anual Palencia", value: 1729, unit: "h/año", category: "Convenios", legalKey: "conv_palencia" },
    { key: "HORAS_FACTURABLES_PALENCIA", label: "Horas productivas Palencia estimadas", value: 1331, unit: "h/año", category: "Convenios", legalKey: "conv_palencia" },
    { key: "PLUS_NOCTURNIDAD_HORA_PALENCIA", label: "Prorrata por hora del plus mensual nocturnidad Palencia 2025", value: 0.2718, unit: "€/h", category: "Convenios salariales", legalKey: "conv_palencia" },
    { key: "PLUS_DOMINGO_PALENCIA", label: "Plus domingo Palencia 2025", value: 7, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_palencia" },
    { key: "PLUS_FESTIVO_PALENCIA", label: "Plus festivo Palencia 2025", value: 15.96, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_palencia" },
    { key: "SIN_PLUS_SABADO_PALENCIA", label: "Sin plus específico de sábado Palencia", value: 0, unit: "€/h", category: "Convenios salariales", legalKey: "conv_palencia" },

    { key: "JORNADA_SALAMANCA_CLM_ANUAL", label: "Jornada anual Salamanca / Castilla-La Mancha", value: 1779, unit: "h/año", category: "Convenios", legalKey: "conv_salamanca_clm" },
    { key: "HORAS_FACTURABLES_SALAMANCA_CLM", label: "Horas productivas Salamanca / CLM estimadas", value: 1369, unit: "h/año", category: "Convenios", legalKey: "conv_salamanca_clm" },
    { key: "PLUS_NOCTURNIDAD_SALAMANCA_CLM", label: "Plus nocturnidad Salamanca / CLM", value: 11.15, unit: "€/noche", category: "Convenios salariales", legalKey: "conv_salamanca_clm" },
    { key: "PLUS_DOMINGO_SALAMANCA_CLM", label: "Plus domingo Salamanca / CLM", value: 13.90, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_salamanca_clm" },
    { key: "PLUS_FESTIVO_SALAMANCA_CLM", label: "Plus festivo Salamanca / CLM", value: 13.90, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_salamanca_clm" },
    { key: "PLUS_FESTIVO_ESPECIAL_SALAMANCA_CLM", label: "Plus festivo especial Salamanca / CLM", value: 30, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_salamanca_clm" },
    { key: "SIN_PLUS_SABADO_SALAMANCA_CLM", label: "Sin plus específico de sábado Salamanca / CLM", value: 0, unit: "€/h", category: "Convenios salariales", legalKey: "conv_salamanca_clm" },

    { key: "JORNADA_VALLADOLID_ANUAL", label: "Jornada anual Valladolid 2025", value: 1744, unit: "h/año", category: "Convenios", legalKey: "conv_valladolid" },
    { key: "HORAS_FACTURABLES_VALLADOLID", label: "Horas productivas Valladolid estimadas", value: 1342, unit: "h/año", category: "Convenios", legalKey: "conv_valladolid" },
    { key: "PLUS_NOCTURNIDAD_HORA_VALLADOLID", label: "Plus nocturnidad proporcional Valladolid 2025", value: 1.051, unit: "€/h", category: "Convenios salariales", legalKey: "conv_valladolid" },
    { key: "PLUS_FESTIVO_VALLADOLID", label: "Plus domingo/festivo Valladolid 2025", value: 14.72, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_valladolid" },
    { key: "PLUS_FESTIVO_ESPECIAL_VALLADOLID", label: "Plus festivo especial Valladolid 2025", value: 29.43, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_valladolid" },
    { key: "SIN_PLUS_SABADO_VALLADOLID", label: "Sin plus específico de sábado Valladolid", value: 0, unit: "€/h", category: "Convenios salariales", legalKey: "conv_valladolid" },

    { key: "JORNADA_ZAMORA_ANUAL", label: "Jornada anual Zamora 2026", value: 1770, unit: "h/año", category: "Convenios", legalKey: "conv_zamora" },
    { key: "HORAS_FACTURABLES_ZAMORA", label: "Horas productivas Zamora estimadas", value: 1362, unit: "h/año", category: "Convenios", legalKey: "conv_zamora" },
    { key: "PLUS_NOCTURNIDAD_HORA_ZAMORA", label: "Plus nocturnidad proporcional Zamora 2026", value: 0.931, unit: "€/h", category: "Convenios salariales", legalKey: "conv_zamora" },
    { key: "PLUS_FESTIVO_ZAMORA", label: "Plus domingo/festivo Zamora 2026", value: 13.79, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_zamora" },
    { key: "PLUS_FESTIVO_ESPECIAL_ZAMORA", label: "Plus festivo especial Zamora 2026", value: 27.59, unit: "€/turno", category: "Convenios salariales", legalKey: "conv_zamora" },
    { key: "SIN_PLUS_SABADO_ZAMORA", label: "Sin plus específico de sábado Zamora", value: 0, unit: "€/h", category: "Convenios salariales", legalKey: "conv_zamora" },
  ]

  // Create legal parameters AFTER legal records
  for (const lp of LEGAL_PARAMETERS_SEED) {
    const legalRecordId = await getRecordByKey(lp.legalKey)
    await db.legalParameter.upsert({
      where: { key: lp.key },
      update: {
        label: lp.label,
        value: String(lp.value),
        unit: lp.unit,
        category: lp.category,
        legalRecordId,
      },
      create: {
        key: lp.key,
        label: lp.label,
        value: String(lp.value),
        unit: lp.unit,
        category: lp.category,
        effectiveFrom: '2026-01-01',
        isActive: true,
        legalRecordId,
      },
    })
    console.log(`  Legal Param upserted: ${lp.key}`)
  }

  console.log('\nSeed completed!')
}

const directRun = process.argv[1]?.replace(/\\/g, '/').endsWith('/scripts/seed.ts')
if (directRun) {
  seedDatabase()
    .catch((e) => {
      console.error('Seed error:', e)
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
