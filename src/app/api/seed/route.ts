import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getHolidaysForDBSeed } from '@/lib/spanish-holidays'
import { hashPassword, requireRole } from '@/lib/auth'
import { generateTemporaryPassword } from '@/lib/password'

export async function POST(request: NextRequest) {
  try {
    // Only admin, and only in non-production environments
    const auth = await requireRole(request, ['admin'])
    if (auth instanceof NextResponse) return auth

    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'El endpoint de seed no está disponible en producción' },
        { status: 403 },
      )
    }

    const counts = { users: 0, categories: 0, surcharges: 0, holidays: 0, laborRules: 0, config: 0, clients: 0 }
    const temporaryCredentials: Array<{ email: string; password: string }> = []

    // 1. Users
    const adminEmail = "admin@gasi.es"
    const existingAdmin = await db.user.findUnique({ where: { email: adminEmail } })
    if (!existingAdmin) {
      const password = generateTemporaryPassword()
      await db.user.create({ data: { email: adminEmail, password: await hashPassword(password), name: "Administrador", role: "admin", active: true, mustChangePassword: true } })
      temporaryCredentials.push({ email: adminEmail, password })
      counts.users++
    }
    const commercialEmail = "comercial@gasi.es"
    const existingCommercial = await db.user.findUnique({ where: { email: commercialEmail } })
    if (!existingCommercial) {
      const password = generateTemporaryPassword()
      await db.user.create({ data: { email: commercialEmail, password: await hashPassword(password), name: "Carlos García", role: "comercial", active: true, mustChangePassword: true } })
      temporaryCredentials.push({ email: commercialEmail, password })
      counts.users++
    }

    // 2. Categories
    const categoriesData = [
      { name: "Médico", description: "Personal médico", defaultPricePerHour: 35, defaultInternalCost: 22, active: true },
      { name: "Enfermero/a", description: "Personal de enfermería", defaultPricePerHour: 22, defaultInternalCost: 14, active: true },
      { name: "Técnico Sanitario", description: "Técnico sanitario", defaultPricePerHour: 20, defaultInternalCost: 13, active: true },
      { name: "Ambulancia", description: "Servicio de transporte sanitario", defaultPricePerHour: 180, defaultInternalCost: 180, active: true },
      { name: "Telemedicina", description: "Servicios de telemedicina", defaultPricePerHour: 30, defaultInternalCost: 20, active: true },
      { name: "Material Sanitario", description: "Material sanitario", defaultPricePerHour: 50, defaultInternalCost: 30, active: true },
      { name: "Coordinación", description: "Coordinación y gestión sanitaria", defaultPricePerHour: 28, defaultInternalCost: 18, active: true },
    ]
    for (const c of categoriesData) {
      const existing = await db.professionalCategory.findFirst({ where: { name: c.name } })
      if (!existing) { await db.professionalCategory.create({ data: c }); counts.categories++ }
    }

    // 3. Surcharges
    const surchargesData = [
      { name: "Nocturnidad", type: "nocturnidad", surchargeType: "percentage", value: 25, description: "Recargo nocturno", active: true },
      { name: "Domingo", type: "domingo", surchargeType: "percentage", value: 50, description: "Recargo domingo", active: true },
      { name: "Festivo nacional", type: "festivo_nacional", surchargeType: "percentage", value: 75, description: "Festivo nacional", active: true },
      { name: "Festivo autonómico", type: "festivo_autonomico", surchargeType: "percentage", value: 50, description: "Festivo autonómico", active: true },
      { name: "Festivo provincial", type: "festivo_provincial", surchargeType: "percentage", value: 25, description: "Festivo provincial", active: true },
      { name: "Festivo municipal", type: "festivo_municipal", surchargeType: "percentage", value: 20, description: "Festivo municipal", active: true },
      { name: "Urgencia", type: "urgencia", surchargeType: "percentage", value: 100, description: "Urgencia", active: true },
      { name: "Difícil cobertura", type: "dificil_cobertura", surchargeType: "percentage", value: 30, description: "Difícil cobertura", active: true },
      { name: "Fin de semana", type: "fin_de_semana", surchargeType: "percentage", value: 25, description: "Fin de semana", active: true },
      { name: "Guardia 24h", type: "guardia_24h", surchargeType: "fixed", value: 45, description: "Guardia 24h", active: true },
      { name: "Desplazamiento", type: "desplazamiento", surchargeType: "fixed", value: 25, description: "Desplazamiento", active: true },
    ]
    for (const s of surchargesData) {
      const existing = await db.surchargeConfig.findFirst({ where: { name: s.name } })
      if (!existing) { await db.surchargeConfig.create({ data: s }); counts.surcharges++ }
    }

    // 4. Holidays
    const holidays = getHolidaysForDBSeed()
    for (const h of holidays) {
      const existing = await db.holiday.findFirst({ where: { date: h.date, name: h.name } })
      if (!existing) {
        await db.holiday.create({ data: { date: h.date, name: h.name, type: h.type, autonomousCommunity: h.autonomousCommunity ?? undefined, province: h.province ?? undefined, municipality: h.municipality ?? undefined, year: Number(h.date.slice(0, 4)), recurring: h.recurring ?? false } })
        counts.holidays++
      }
    }

    // 5. Labor Rules
    const existingRule = await db.laborRule.findFirst({ where: { name: "Estándar España" } })
    if (!existingRule) {
      await db.laborRule.create({ data: { name: "Estándar España", maxWeeklyHours: 40, maxDailyHours: 12, minRestBetweenShiftsH: 12, maxConsecutiveDays: 6, nightStartHour: 22, nightEndHour: 6 } })
      counts.laborRules++
    } else if (existingRule.minRestBetweenShiftsH < 12) {
      await db.laborRule.update({ where: { id: existingRule.id }, data: { minRestBetweenShiftsH: 12 } })
    }

    // 6. App Config
    const configData: Record<string, string> = {
      company_name: "GASI — Grupo de Asistencia Sanitaria Integral",
      company_cif: "",
      company_address: "",
      company_phone: "622 822 101",
      company_email: "coordinacion@gasisalud.com",
      iva_default: "21",
      valid_days_default: "30",
      costing_province: "Madrid",
      costing_overhead_percent: "15",
      costing_management_fee_per_contract: "15",
    }
    for (const [key, value] of Object.entries(configData)) {
      const existing = await db.appConfig.findUnique({ where: { key } })
      if (!existing) { await db.appConfig.create({ data: { key, value } }); counts.config++ }
    }

    // 7. Client
    const existingClient = await db.client.findFirst({ where: { cif: "B87654321" } })
    if (!existingClient) {
      await db.client.create({
        data: { businessName: "Hospital Central Universitario", cif: "B87654321", fiscalAddress: "Av. de la Constitución 42, 28071 Madrid", contactPerson: "Dr. Martínez", email: "compras@hospitalcentral.es", phone: "917654321", sector: "Hospitalario", paymentTerms: "Net 60 días" },
      })
      counts.clients++
    }

    return NextResponse.json({ success: true, message: "Datos iniciales cargados", counts, temporaryCredentials })
  } catch (error) {
    console.error("Error seeding database:", error)
    return NextResponse.json({ success: false, message: "Error al cargar los datos iniciales", error: String(error) }, { status: 500 })
  }
}
