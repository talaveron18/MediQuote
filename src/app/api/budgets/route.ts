import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { exportBudgetLightweight } from '@/lib/export-budget-lightweight'
import type { BudgetStatus, ServiceBlockInput } from '@/lib/types'

// Strip internal fields before saving (commercial security)
function stripInternalFields(block: Record<string, any>): Record<string, any> {
  const clean: Record<string, unknown> = { ...block }
  delete clean['internalCostPerHour']
  delete clean['internalMargin']
  return clean
}

// ─── Helpers ──────────────────────────────────────────────────────

function generateBudgetCode(existingCount: number): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const seq = String(existingCount + 1).padStart(3, '0')
  return `PRES-${y}${m}${d}-${seq}`
}

function todayPrefix(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `PRES-${y}${m}${d}-`
}

function serializeServiceBlockData(block: Record<string, any>): Record<string, any> {
  return {
    serviceName: block.serviceName,
    professionalCategory: block.professionalCategory,
    professionalsRequested: block.puestosSimultaneos ?? block.professionalsRequested ?? 1,
    pricePerHour: block.pricePerHour,
    internalCostPerHour: block.internalCostPerHour ?? null,
    internalMargin: block.internalMargin ?? null,
    dateMode: block.dateMode,
    specificDates: block.specificDates ? JSON.stringify(block.specificDates) : null,
    dateRangeStart: block.dateRangeStart ?? null,
    dateRangeEnd: block.dateRangeEnd ?? null,
    daysOfWeek: block.daysOfWeek ? JSON.stringify(block.daysOfWeek) : null,
    excludeSundays: block.excludeSundays ?? false,
    excludeHolidays: block.excludeHolidays ?? false,
    holidayTypesExcluded: block.holidayTypesExcluded
      ? JSON.stringify(block.holidayTypesExcluded)
      : null,
    shiftType: block.shiftType,
    shiftStartTime: block.shiftStartTime ?? null,
    shiftEndTime: block.shiftEndTime ?? null,
    hoursPerDay: block.hoursPerDay ?? 8,
    breakMinutes: block.breakMinutes ?? 0,
    unitType: block.unitType ?? 'hora',
    quantity: block.quantity ?? 1,
    fixedPrice: block.fixedPrice ?? null,
    selectedProfessionals: block.plantillaSeleccionada ?? block.selectedProfessionals ?? 1,
    observations: block.observations ?? null,
    enabledSurcharges: block.enabledSurcharges ? JSON.stringify(block.enabledSurcharges) : null,
  }
}

/**
 * Sanitize budget response for comercial users:
 * - Remove internalNotes from budget
 * - Remove internalCostPerHour, internalMargin from serviceBlocks
 */
function sanitizeBudgetForCommercial(budget: any): any {
  const { internalNotes, serviceBlocks, ...rest } = budget
  const cleanBlocks = serviceBlocks?.map((block: any) => {
    const { internalCostPerHour, internalMargin, ...cleanBlock } = block
    return cleanBlock
  })
  return { ...rest, serviceBlocks: cleanBlocks }
}

function sanitizeBudgetsForRole(data: { budgets: any[] }, role: string) {
  if (role === 'admin' || role === 'maestro') return data
  return {
    budgets: data.budgets.map(sanitizeBudgetForCommercial),
  }
}

// ─── GET ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const clientId = searchParams.get('clientId')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (clientId) {
      where.clientId = clientId
    }

    if (search) {
      where.OR = [
        { code: { contains: search } },
        { description: { contains: search } },
        { client: { businessName: { contains: search } } },
      ]
    }

    const budgets = await db.budget.findMany({
      where,
      include: {
        client: {
          select: { businessName: true, cif: true },
        },
        createdBy: {
          select: { name: true },
        },
        _count: {
          select: { serviceBlocks: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = { budgets }
    return NextResponse.json(sanitizeBudgetsForRole(result, auth.role))
  } catch (error) {
    console.error('[GET /api/budgets] Error:', error)
    return NextResponse.json(
      { error: 'Error al obtener presupuestos' },
      { status: 500 },
    )
  }
}

// ─── POST ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const {
      clientId,
      status = 'borrador' as BudgetStatus,
      validUntil,
      description,
      subtotal = 0,
      totalSurcharges = 0,
      discountPercent = 0,
      discountAmount = 0,
      ivaPercent = 21,
      ivaAmount = 0,
      totalFinal = 0,
      clientNotes,
      internalNotes,
      serviceBlocks,
    } = body

    // Resolve client ID by CIF (supports old and new IDs)
    let resolvedClientId = clientId
    if (clientId && !clientId.startsWith('cmr')) {
      const client = await db.client.findFirst({ where: { cif: clientId } })
      if (client) resolvedClientId = client.id
    }

    // Auto-generate sequential code for today
    const prefix = todayPrefix()
    const todayCount = await db.budget.count({
      where: { code: { startsWith: prefix } },
    })
    const code = generateBudgetCode(todayCount)

    // Security: strip internal fields for commercial users; admin/maestro keeps full data
    const canSeeInternal = auth.role === 'admin' || auth.role === 'maestro';
    const blocksToSave = canSeeInternal
      ? (serviceBlocks ?? [])
      : (serviceBlocks?.map(stripInternalFields) ?? [])

    // Create budget — use authenticated user's ID
    const budget = await db.budget.create({
      data: {
        code,
        clientId: resolvedClientId,
        createdById: auth.id,
        status,
        validUntil: validUntil ?? null,
        description: description ?? null,
        subtotal,
        totalSurcharges,
        discountPercent,
        discountAmount,
        ivaPercent,
        ivaAmount,
        totalFinal,
        clientNotes: clientNotes ?? null,
        // internalNotes only settable by admin/maestro
        internalNotes: canSeeInternal ? (internalNotes ?? null) : null,
        serviceBlocks: blocksToSave.length
          ? {
              create: blocksToSave.map((block: ServiceBlockInput, index: number) => ({
                ...serializeServiceBlockData(block),
                sortOrder: index,
              })),
            }
          : undefined,
        history: {
          create: {
            userId: auth.id,
            action: 'created',
          },
        },
      },
      include: {
        serviceBlocks: true,
      },
    })

    // Auto-export: JSON + CSV + AuditLog (lightweight, no PDF)
    exportBudgetLightweight(budget.id, {
      id: auth.id,
      email: auth.email,
      name: auth.name,
      role: auth.role,
    }).catch(err => console.error('[POST /api/budgets] Auto-export error:', err))

    // Sanitize response for comercial users
    const result = { budget }
    if (!canSeeInternal) {
      return NextResponse.json({
        budget: sanitizeBudgetForCommercial(budget),
      }, { status: 201 })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[POST /api/budgets] Error:', error)
    return NextResponse.json(
      { error: 'Error al crear presupuesto' },
      { status: 500 },
    )
  }
}

// ─── PUT ──────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { id, serviceBlocks, ...updateData } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Se requiere el ID del presupuesto' },
        { status: 400 },
      )
    }

    // Fetch existing budget to detect status change
    const existing = await db.budget.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Presupuesto no encontrado' },
        { status: 404 },
      )
    }

    const userId = auth.id
    const historyEntries: {
      userId: string
      action: string
      oldStatus?: string | null
      newStatus?: string | null
    }[] = []

    // Detect status change
    if (updateData.status && updateData.status !== existing.status) {
      historyEntries.push({
        userId,
        action: 'status_changed',
        oldStatus: existing.status,
        newStatus: updateData.status,
      })
    }

    // Always record a modification
    historyEntries.push({
      userId,
      action: 'modified',
    })

    // Prepare update payload (remove fields that shouldn't be directly set)
    const {
      clientId,
      status,
      validUntil,
      description,
      subtotal,
      totalSurcharges,
      discountPercent,
      discountAmount,
      ivaPercent,
      ivaAmount,
      totalFinal,
      clientNotes,
      internalNotes,
    } = updateData

    // For comercial users, strip internal fields from service block updates
    const canSeeInternal = auth.role === 'admin' || auth.role === 'maestro';
    let processedBlocks = serviceBlocks
    if (processedBlocks && !canSeeInternal) {
      processedBlocks = processedBlocks.map((block: any) => {
        const { internalCostPerHour, internalMargin, ...rest } = block
        return rest
      })
    }

    // Delete existing service blocks if new ones are provided
    if (processedBlocks !== undefined) {
      await db.serviceBlock.deleteMany({
        where: { budgetId: id },
      })
    }

    // Update budget
    const updated = await db.budget.update({
      where: { id },
      data: {
        ...(clientId !== undefined && { clientId }),
        ...(status !== undefined && { status }),
        ...(validUntil !== undefined && { validUntil: validUntil ?? null }),
        ...(description !== undefined && { description: description ?? null }),
        ...(subtotal !== undefined && { subtotal }),
        ...(totalSurcharges !== undefined && { totalSurcharges }),
        ...(discountPercent !== undefined && { discountPercent }),
        ...(discountAmount !== undefined && { discountAmount }),
        ...(ivaPercent !== undefined && { ivaPercent }),
        ...(ivaAmount !== undefined && { ivaAmount }),
        ...(totalFinal !== undefined && { totalFinal }),
        ...(clientNotes !== undefined && { clientNotes: clientNotes ?? null }),
        // internalNotes only settable by admin/maestro
        ...(canSeeInternal && internalNotes !== undefined && { internalNotes: internalNotes ?? null }),
        // Recreate service blocks if provided
        ...(processedBlocks?.length
          ? {
              serviceBlocks: {
                create: processedBlocks.map((block: ServiceBlockInput, index: number) => ({
                  ...serializeServiceBlockData(block),
                  sortOrder: index,
                })),
              },
            }
          : {}),
        // Create history entries
        history: {
          create: historyEntries,
        },
      },
      include: {
        serviceBlocks: true,
        client: {
          select: { businessName: true, cif: true },
        },
        createdBy: {
          select: { name: true },
        },
      },
    })

    // Auto-export: JSON + CSV + AuditLog (lightweight, no PDF)
    exportBudgetLightweight(updated.id, {
      id: auth.id,
      email: auth.email,
      name: auth.name,
      role: auth.role,
    }).catch(err => console.error('[PUT /api/budgets] Auto-export error:', err))

    // Sanitize response for comercial users
    if (!canSeeInternal) {
      return NextResponse.json({ budget: sanitizeBudgetForCommercial(updated) })
    }
    return NextResponse.json({ budget: updated })
  } catch (error) {
    console.error('[PUT /api/budgets] Error:', error)
    return NextResponse.json(
      { error: 'Error al actualizar presupuesto' },
      { status: 500 },
    )
  }
}

// ─── DELETE ───────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Se requiere el ID del presupuesto' },
        { status: 400 },
      )
    }

    const existing = await db.budget.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Presupuesto no encontrado' },
        { status: 404 },
      )
    }

    // Soft-delete: set status to caducado
    await db.budget.update({
      where: { id },
      data: {
        status: 'caducado',
        history: {
          create: {
            userId: auth.id,
            action: 'status_changed',
            oldStatus: existing.status,
            newStatus: 'caducado',
          },
        },
      },
    })

    // Re-export to reflect new status in JSON + CSV + AuditLog
    exportBudgetLightweight(id, {
      id: auth.id,
      email: auth.email,
      name: auth.name,
      role: auth.role,
    }).catch(err => console.error('[DELETE /api/budgets] Auto-export error:', err))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/budgets] Error:', error)
    return NextResponse.json(
      { error: 'Error al eliminar presupuesto' },
      { status: 500 },
    )
  }
}