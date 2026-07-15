import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, requireRole, sanitizeForRole } from '@/lib/auth'
import { generateTemporaryPassword } from '@/lib/password'
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy'

// Types that 'comercial' can also access (read-only)
const COMMERCIAL_READABLE_TYPES = ['categories', 'surcharges', 'laborRules', 'holidays']

// ─── GET /api/config ───────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const all = searchParams.get('all') === 'true'

    // Auth: determine allowed roles based on type
    const allowedForType = COMMERCIAL_READABLE_TYPES.includes(type ?? '')
      ? ['admin', 'comercial', 'maestro'] as const
      : ['admin', 'maestro'] as const

    const auth = await requireRole(request, [...allowedForType])
    if (auth instanceof NextResponse) return auth

    switch (type) {
      // ── Categories ──────────────────────────────────────────────
      case 'categories': {
        const categories = await db.professionalCategory.findMany({
          where: all ? undefined : { active: true },
          orderBy: { name: 'asc' },
        })
        return NextResponse.json(sanitizeForRole(categories, auth.role))
      }

      // ── Surcharges ──────────────────────────────────────────────
      case 'surcharges': {
        const surcharges = await db.surchargeConfig.findMany({
          where: all ? undefined : { active: true },
          orderBy: { name: 'asc' },
        })
        return NextResponse.json(surcharges)
      }

      // ── Labor Rules ─────────────────────────────────────────────
      case 'laborRules': {
        const laborRules = await db.laborRule.findMany({
          orderBy: { name: 'asc' },
        })
        return NextResponse.json(laborRules)
      }

      // ── Holidays ────────────────────────────────────────────────
      case 'holidays': {
        const where: any = {}
        const year = searchParams.get('year')
        const holidayType = searchParams.get('type')
        if (year) where.year = parseInt(year, 10)
        if (holidayType) where.type = holidayType

        const holidays = await db.holiday.findMany({
          where: Object.keys(where).length > 0 ? where : undefined,
          orderBy: { date: 'asc' },
        })
        return NextResponse.json(holidays)
      }

      // ── App Config ──────────────────────────────────────────────
      case 'appConfig': {
        const configs = await db.appConfig.findMany()
        const kv: Record<string, string> = {}
        for (const c of configs) {
          kv[c.key] = c.value
        }
        return NextResponse.json(kv)
      }

      // ── Users ───────────────────────────────────────────────────
      case 'users': {
        const users = await db.user.findMany({
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            active: true,
          },
          orderBy: { name: 'asc' },
        })
        return NextResponse.json(users)
      }

      // ── All Config ──────────────────────────────────────────────
      case 'all': {
        const [categories, surcharges, laborRules, holidays, appConfigs, users] =
          await Promise.all([
            db.professionalCategory.findMany({
              where: all ? undefined : { active: true },
              orderBy: { name: 'asc' },
            }),
            db.surchargeConfig.findMany({
              where: all ? undefined : { active: true },
              orderBy: { name: 'asc' },
            }),
            db.laborRule.findMany({ orderBy: { name: 'asc' } }),
            db.holiday.findMany({ orderBy: { date: 'asc' } }),
            db.appConfig.findMany(),
            db.user.findMany({
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                active: true,
              },
              orderBy: { name: 'asc' },
            }),
          ])

        const appConfig: Record<string, string> = {}
        for (const c of appConfigs) {
          appConfig[c.key] = c.value
        }

        return NextResponse.json({
          categories,
          surcharges,
          laborRules,
          holidays,
          appConfig,
          users,
        })
      }

      default:
        return NextResponse.json(
          { error: `Tipo de configuración no válido: ${type}` },
          { status: 400 },
        )
    }
  } catch (error) {
    console.error('Error fetching config:', error)
    return NextResponse.json(
      { error: 'Error al obtener la configuración' },
      { status: 500 },
    )
  }
}

// ─── POST /api/config ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro'])
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const body = await request.json()

    switch (type) {
      // ── Create Category ─────────────────────────────────────────
      case 'category': {
        const { name, defaultPricePerHour, description, defaultInternalCost, active } = body
        if (!name || defaultPricePerHour === undefined) {
          return NextResponse.json(
            { error: 'Los campos name y defaultPricePerHour son obligatorios' },
            { status: 400 },
          )
        }
        const category = await db.professionalCategory.create({
          data: {
            name,
            defaultPricePerHour,
            description,
            defaultInternalCost,
            active: active ?? true,
          },
        })
        return NextResponse.json(category, { status: 201 })
      }

      // ── Create Surcharge ────────────────────────────────────────
      case 'surcharge': {
        const { name, type: sType, surchargeType, value, description, active } = body
        if (!name || !sType || !surchargeType || value === undefined) {
          return NextResponse.json(
            { error: 'Los campos name, type, surchargeType y value son obligatorios' },
            { status: 400 },
          )
        }
        const surcharge = await db.surchargeConfig.create({
          data: {
            name,
            type: sType,
            surchargeType,
            value,
            description,
            active: active ?? true,
          },
        })
        return NextResponse.json(surcharge, { status: 201 })
      }

      // ── Create Labor Rule ───────────────────────────────────────
      case 'laborRule': {
        const {
          name,
          maxWeeklyHours,
          maxDailyHours,
          minRestBetweenShiftsH,
          maxConsecutiveDays,
          nightStartHour,
          nightEndHour,
        } = body
        if (!name) {
          return NextResponse.json(
            { error: 'El campo name es obligatorio' },
            { status: 400 },
          )
        }
        if (minRestBetweenShiftsH !== undefined && Number(minRestBetweenShiftsH) < 12) {
          return NextResponse.json(
            { error: 'El descanso mínimo entre jornadas no puede ser inferior a 12 horas' },
            { status: 400 },
          )
        }
        const rule = await db.laborRule.create({
          data: {
            name,
            maxWeeklyHours: maxWeeklyHours ?? 40,
            maxDailyHours: maxDailyHours ?? 12,
            minRestBetweenShiftsH: minRestBetweenShiftsH ?? 12,
            maxConsecutiveDays: maxConsecutiveDays ?? 6,
            nightStartHour: nightStartHour ?? 22,
            nightEndHour: nightEndHour ?? 6,
          },
        })
        return NextResponse.json(rule, { status: 201 })
      }

      // ── Create Holiday ──────────────────────────────────────────
      case 'holiday': {
        const { date, name, type: hType, autonomousCommunity, province, municipality, year, recurring } = body
        if (!date || !name || !hType) {
          return NextResponse.json(
            { error: 'Los campos date, name y type son obligatorios' },
            { status: 400 },
          )
        }
        const holiday = await db.holiday.create({
          data: {
            date,
            name,
            type: hType,
            autonomousCommunity,
            province,
            municipality,
            year: year ?? null,
            recurring: recurring ?? true,
          },
        })
        return NextResponse.json(holiday, { status: 201 })
      }

      // ── Create User ─────────────────────────────────────────────
      case 'user': {
        const { email, name, role, password } = body
        if (!email || !name || !role) {
          return NextResponse.json(
            { error: 'Los campos email, name y role son obligatorios' },
            { status: 400 },
          )
        }
        if ((role === 'maestro' || role === 'admin') && auth.role !== 'maestro') {
          return NextResponse.json(
            { error: 'Solo el titular puede crear administradores o maestros' },
            { status: 403 },
          )
        }
        const temporaryPassword = password || generateTemporaryPassword()
        if (!isStrongEnoughPassword(temporaryPassword)) {
          return NextResponse.json(
            { error: `La contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres` },
            { status: 400 },
          )
        }
        const user = await db.user.create({
          data: {
            email: email.toLowerCase().trim(),
            name,
            role,
            password: await hashPassword(temporaryPassword),
            mustChangePassword: true,
            createdById: auth.id,
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            active: true,
          },
        })
        return NextResponse.json({
          ...user,
          ...(!password && { temporaryPassword }),
        }, { status: 201 })
      }

      // ── Upsert AppConfig ────────────────────────────────────────
      case 'appConfig': {
        const { key, value } = body
        if (!key || value === undefined) {
          return NextResponse.json(
            { error: 'Los campos key y value son obligatorios' },
            { status: 400 },
          )
        }

        // License/branding keys are maestro-only
        const MAESTRO_KEYS = [
          'licenseHolder', 'productName', 'copyrightText', 'licenseText',
          'internalUseText', 'pdfFooterText',
        ];
        if (MAESTRO_KEYS.includes(key) && auth.role !== 'maestro') {
          return NextResponse.json(
            { error: 'Solo el titular puede modificar estos campos' },
            { status: 403 },
          )
        }

        const config = await db.appConfig.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
        return NextResponse.json(config)
      }

      default:
        return NextResponse.json(
          { error: `Tipo de configuración no válido para POST: ${type}` },
          { status: 400 },
        )
    }
  } catch (error) {
    console.error('Error creating config:', error)
    return NextResponse.json(
      { error: 'Error al crear la configuración' },
      { status: 500 },
    )
  }
}

// ─── PUT /api/config ───────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro'])
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const body = await request.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Se requiere el campo id' },
        { status: 400 },
      )
    }

    switch (type) {
      // ── Update Category ─────────────────────────────────────────
      case 'category': {
        const { createdAt, updatedAt, ...data } = fields as any
        const category = await db.professionalCategory.update({
          where: { id },
          data,
        })
        return NextResponse.json(category)
      }

      // ── Update Surcharge ────────────────────────────────────────
      case 'surcharge': {
        const { createdAt, updatedAt, ...data } = fields as any
        const surcharge = await db.surchargeConfig.update({
          where: { id },
          data,
        })
        return NextResponse.json(surcharge)
      }

      // ── Update Labor Rule ───────────────────────────────────────
      case 'laborRule': {
        const { createdAt, updatedAt, ...data } = fields as any
        if (
          data.minRestBetweenShiftsH !== undefined
          && Number(data.minRestBetweenShiftsH) < 12
        ) {
          return NextResponse.json(
            { error: 'El descanso mínimo entre jornadas no puede ser inferior a 12 horas' },
            { status: 400 },
          )
        }
        const rule = await db.laborRule.update({
          where: { id },
          data,
        })
        return NextResponse.json(rule)
      }

      // ── Update User ─────────────────────────────────────────────
      case 'user': {
        const { createdAt, updatedAt, budgetsCreated, historyEntries, password, ...data } = fields as any
        const target = await db.user.findUnique({ where: { id } })
        if (!target) {
          return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
        }
        if (target.role === 'maestro' && auth.role !== 'maestro') {
          return NextResponse.json({ error: 'No se puede modificar al titular' }, { status: 403 })
        }
        if ((data.role === 'maestro' || data.role === 'admin') && auth.role !== 'maestro') {
          return NextResponse.json(
            { error: 'Solo el titular puede asignar ese rol' },
            { status: 403 },
          )
        }
        const updateData = { ...data }
        if (password) {
          if (!isStrongEnoughPassword(password)) {
            return NextResponse.json(
              { error: `La contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres` },
              { status: 400 },
            )
          }
          updateData.password = await hashPassword(password)
          updateData.mustChangePassword = true
        }
        const user = await db.user.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            active: true,
          },
        })
        return NextResponse.json(user)
      }

      default:
        return NextResponse.json(
          { error: `Tipo de configuración no válido para PUT: ${type}` },
          { status: 400 },
        )
    }
  } catch (error) {
    console.error('Error updating config:', error)
    return NextResponse.json(
      { error: 'Error al actualizar la configuración' },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/config ────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro'])
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Se requiere el parámetro id' },
        { status: 400 },
      )
    }

    switch (type) {
      // ── Delete Category ─────────────────────────────────────────
      case 'category': {
        await db.professionalCategory.delete({ where: { id } })
        return NextResponse.json({ success: true })
      }

      // ── Delete Surcharge ────────────────────────────────────────
      case 'surcharge': {
        await db.surchargeConfig.delete({ where: { id } })
        return NextResponse.json({ success: true })
      }

      // ── Delete Holiday ──────────────────────────────────────────
      case 'holiday': {
        await db.holiday.delete({ where: { id } })
        return NextResponse.json({ success: true })
      }

      // ── Soft-delete User ────────────────────────────────────────
      case 'user': {
        const target = await db.user.findUnique({ where: { id } })
        if (!target) {
          return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
        }
        if (target.role === 'maestro') {
          return NextResponse.json({ error: 'No se puede desactivar al titular' }, { status: 403 })
        }
        const user = await db.user.update({
          where: { id },
          data: { active: false },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            active: true,
          },
        })
        return NextResponse.json(user)
      }

      default:
        return NextResponse.json(
          { error: `Tipo de configuración no válido para DELETE: ${type}` },
          { status: 400 },
        )
    }
  } catch (error) {
    console.error('Error deleting config:', error)
    return NextResponse.json(
      { error: 'Error al eliminar la configuración' },
      { status: 500 },
    )
  }
}
