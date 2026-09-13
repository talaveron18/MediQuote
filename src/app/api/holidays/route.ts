import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response'

const YEAR_PATTERN = /^\d{4}$/
const TYPE_PATTERN = /^[a-záéíóúüñ_\- ]{1,40}$/i

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['comercial', 'admin', 'maestro'])
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')
  const type = searchParams.get('type')

  if (year !== null && !YEAR_PATTERN.test(year)) {
    return privateNoStoreJson({ error: 'Año no válido' }, { status: 400 })
  }
  if (type !== null && !TYPE_PATTERN.test(type)) {
    return privateNoStoreJson({ error: 'Tipo de festivo no válido' }, { status: 400 })
  }

  try {
    const where: Record<string, unknown> = {}
    if (year) where.date = { startsWith: year }
    if (type) where.type = type

    const holidays = await db.holiday.findMany({
      where,
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        name: true,
        type: true,
        autonomousCommunity: true,
        province: true,
        municipality: true,
      },
    })

    return privateNoStoreJson({ holidays })
  } catch (error) {
    console.error('[GET /api/holidays] Error:', error)
    return genericInternalErrorResponse('Error al obtener festivos')
  }
}
