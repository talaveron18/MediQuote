import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── GET ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const type = searchParams.get('type')

    const where: Record<string, unknown> = {}

    if (year) {
      where.date = { startsWith: year }
    }

    if (type) {
      where.type = type
    }

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

    return NextResponse.json({ holidays })
  } catch (error) {
    console.error('[GET /api/holidays] Error:', error)
    return NextResponse.json(
      { error: 'Error al obtener festivos' },
      { status: 500 },
    )
  }
}