import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getHolidaysForDBSeed } from '@/lib/spanish-holidays'
import { hashPassword, requireRole } from '@/lib/auth'
import { generateTemporaryPassword } from '@/lib/password'
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin'])
    if (auth instanceof NextResponse) return auth

    if (process.env.NODE_ENV === 'production') {
      return privateNoStoreJson(
        { error: 'El endpoint de seed no está disponible en producción' },
        { status: 403 },
      )
    }

    if (process.env.MEDIQUOTE_ALLOW_SYNTHETIC_SEED !== 'true') {
      return privateNoStoreJson(
        { error: 'El seed sintético requiere habilitación explícita del entorno' },
        { status: 403 },
      )
    }

    const counts = { users: 0, holidays: 0 }
    const temporaryCredentials: Array<{ email: string; password: string }> = []

    // Usuarios exclusivamente sintéticos para entornos no productivos.
    // No se crean tarifas, costes, recargos, márgenes, comisiones, reglas laborales,
    // parámetros económicos ni clientes ficticios desde este endpoint.
    const users = [
      { email: 'admin@gasi.es', name: 'Administrador sintético', role: 'admin' },
      { email: 'comercial@gasi.es', name: 'Comercial sintético', role: 'comercial' },
    ] as const

    for (const user of users) {
      const existing = await db.user.findUnique({ where: { email: user.email } })
      if (existing) continue

      const password = generateTemporaryPassword()
      await db.user.create({
        data: {
          email: user.email,
          password: await hashPassword(password),
          name: user.name,
          role: user.role,
          active: true,
          mustChangePassword: true,
        },
      })
      temporaryCredentials.push({ email: user.email, password })
      counts.users++
    }

    const holidays = getHolidaysForDBSeed()
    for (const holiday of holidays) {
      const existing = await db.holiday.findFirst({
        where: { date: holiday.date, name: holiday.name },
      })
      if (existing) continue

      await db.holiday.create({
        data: {
          date: holiday.date,
          name: holiday.name,
          type: holiday.type,
          autonomousCommunity: holiday.autonomousCommunity ?? undefined,
          province: holiday.province ?? undefined,
          municipality: holiday.municipality ?? undefined,
          year: Number(holiday.date.slice(0, 4)),
          recurring: holiday.recurring ?? false,
        },
      })
      counts.holidays++
    }

    return privateNoStoreJson({
      success: true,
      message: 'Datos sintéticos no económicos cargados',
      counts,
      temporaryCredentials,
    })
  } catch (error) {
    console.error('Error seeding synthetic database:', error)
    return genericInternalErrorResponse('Error al cargar los datos sintéticos')
  }
}
