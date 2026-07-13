import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, sanitizeForRole } from '@/lib/auth'
import { calculateServiceBlock, calculateBudgetTotals } from '@/lib/calculation-engine'
import { generateHolidaysForYear } from '@/lib/spanish-holidays'
import type {
  ServiceBlockInput,
  BlockCalculationResult,
  BudgetCalculationResult,
  HolidayInfo,
} from '@/lib/types'

// ─── POST ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const {
      blocks,
      discountPercent = 0,
      ivaPercent = 21,
      location,
    } = body as {
      blocks: ServiceBlockInput[]
      discountPercent?: number
      ivaPercent?: number
      location?: { cc?: string; province?: string }
    }

    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere al menos un bloque de servicio' },
        { status: 400 },
      )
    }

    // Fetch active surcharges from DB
    const dbSurcharges = await db.surchargeConfig.findMany({
      where: { active: true },
    })

    const surcharges = dbSurcharges.map((s) => ({
      type: s.type as import('@/lib/types').SurchargeType,
      name: s.name,
      surchargeType: s.surchargeType as import('@/lib/types').SurchargeKind,
      value: s.value,
    }))

    // Fetch labor rules from DB
    const laborRule = await db.laborRule.findFirst()
    const laborRules = laborRule
      ? {
          maxWeeklyHours: laborRule.maxWeeklyHours,
          maxDailyHours: laborRule.maxDailyHours,
          minRestBetweenShiftsH: laborRule.minRestBetweenShiftsH,
          maxConsecutiveDays: laborRule.maxConsecutiveDays,
          nightStartHour: laborRule.nightStartHour,
          nightEndHour: laborRule.nightEndHour,
        }
      : {
          maxWeeklyHours: 40,
          maxDailyHours: 12,
          minRestBetweenShiftsH: 11,
          maxConsecutiveDays: 6,
          nightStartHour: 22,
          nightEndHour: 6,
        }

    // Fetch holidays from DB — start with nacional, then add location-based
    const holidayWhere: Record<string, unknown>[] = [{ type: 'nacional' }]

    if (location?.cc) {
      holidayWhere.push({
        type: 'autonomico',
        autonomousCommunity: location.cc,
      })
    }

    if (location?.province) {
      holidayWhere.push({
        type: 'provincial',
        province: location.province,
      })
    }

    const dbHolidays = await db.holiday.findMany({
      where: { OR: holidayWhere },
    })

    // Convert DB holidays to HolidayInfo[] format
    const holidays: HolidayInfo[] = dbHolidays.map((h) => ({
      date: h.date,
      name: h.name,
      type: h.type as HolidayInfo['type'],
      autonomousCommunity: h.autonomousCommunity ?? undefined,
      province: h.province ?? undefined,
      municipality: h.municipality ?? undefined,
    }))

    // If no holidays in DB, fall back to generated holidays
    if (holidays.length === 0) {
      const currentYear = new Date().getFullYear()
      const generated = generateHolidaysForYear(currentYear, location)
      holidays.push(...generated)
      // Also include next year
      const nextYear = generateHolidaysForYear(currentYear + 1, location)
      holidays.push(...nextYear)
    }

    // Calculate each block
    const blockResults: BlockCalculationResult[] = blocks.map((block) =>
      calculateServiceBlock({
        block,
        holidays,
        surcharges,
        laborRules,
      }),
    )

    // Calculate budget totals
    const totals = calculateBudgetTotals(blockResults, discountPercent, ivaPercent)

    const result = { blocks: blockResults, totals }
    return NextResponse.json(sanitizeForRole(result, auth.role))
  } catch (error) {
    console.error('[POST /api/calculations] Error:', error)
    return NextResponse.json(
      { error: 'Error al realizar el cálculo' },
      { status: 500 },
    )
  }
}