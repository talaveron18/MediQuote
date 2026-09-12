import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { exportBudgetLightweight } from '@/lib/export-budget-lightweight'
import { claimCostingQuote } from '@/lib/single-use-quote'
import { sealBudgetArtifactWithClient } from '@/lib/economic-artifact-store'
import { buildPersistedBudgetSealPayload } from '@/lib/budget-seal-payload'
import type { BudgetStatus } from '@/lib/types'

class CostingQuoteConflict extends Error {}
class BudgetSealConflict extends Error {}
class BudgetAcceptedConflict extends Error {}

const validBudgetStatuses = new Set<BudgetStatus>(['borrador', 'enviado', 'aceptado', 'rechazado', 'caducado'])

function badBudgetRequest(error: string) {
  return NextResponse.json({ error }, {
    status: 400,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

async function readBudgetBody(request: NextRequest): Promise<Record<string, any> | null> {
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null
    return body as Record<string, any>
  } catch {
    return null
  }
}

function hasInvalidBudgetStatus(status: unknown): boolean {
  return status !== undefined && (typeof status !== 'string' || !validBudgetStatuses.has(status as BudgetStatus))
}

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
    contractType: block.contractType ?? null,
    blockType: block.blockType ?? null,
    dateUIMode: block.dateUIMode ?? null,
    dateMode: block.dateMode,
    specificDates: block.specificDates ? JSON.stringify(block.specificDates) : null,
    dateRangeStart: block.dateRangeStart ?? null,
    dateRangeEnd: block.dateRangeEnd ?? null,
    daysOfWeek: block.daysOfWeek ? JSON.stringify(block.daysOfWeek) : null,
    excludeSundays: block.excludeSundays ?? false,
    excludeHolidays: block.excludeHolidays ?? false,
    holidayTypesExcluded: block.holidayTypesExcluded ? JSON.stringify(block.holidayTypesExcluded) : null,
    shiftType: block.shiftType,
    shiftStartTime: block.shiftStartTime ?? null,
    shiftEndTime: block.shiftEndTime ?? null,
    hoursPerDay: block.hoursPerDay ?? 8,
    breakMinutes: block.breakMinutes ?? 0,
    unitType: block.unitType ?? 'hora',
    quantity: block.quantity ?? 1,
    fixedPrice: block.fixedPrice ?? null,
    ivaPercent: block.ivaPercent ?? 21,
    courseName: block.courseName ?? null,
    courseTeacher: block.courseTeacher ?? null,
    courseModality: block.courseModality ?? null,
    courseSessions: block.courseSessions ?? null,
    materialName: block.materialName ?? null,
    accommodationNights: block.accommodationNights ?? null,
    accommodationPersons: block.accommodationPersons ?? null,
    transportType: block.transportType ?? null,
    selectedProfessionals: block.plantillaSeleccionada ?? block.selectedProfessionals ?? 1,
    observations: block.observations ?? null,
    enabledSurcharges: block.enabledSurcharges ? JSON.stringify(block.enabledSurcharges) : null,
    totalWorkingDays: block.totalWorkingDays ?? 0,
    totalHours: block.totalHours ?? block.coverageHours ?? 0,
    totalSurcharges: block.totalSurcharges ?? 0,
    minProfessionals: block.plantillaMinimaRecomendada ?? block.minProfessionals ?? 1,
    overtimeHours: block.overtimeHours ?? 0,
    blockSubtotal: block.blockSubtotal ?? 0,
    blockDiscountAmount: block.discountAmount ?? block.blockDiscountAmount ?? 0,
    blockClosingPrice: block.closingPriceExVat ?? block.blockClosingPrice ?? block.totalWithSurcharges ?? 0,
    ivaAmount: block.ivaAmount ?? 0,
    blockTotalFinal: block.totalWithVat ?? block.blockTotalFinal ?? 0,
    surchargeBreakdown: block.surcharges ? JSON.stringify(block.surcharges) : null,
    laborWarnings: block.laborWarnings ? JSON.stringify(block.laborWarnings) : null,
  }
}

function parseJsonArray<T>(value: unknown, fallback: T[]): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string' || !value) return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function deserializeServiceBlock(block: Record<string, any>): Record<string, any> {
  return {
    ...block,
    puestosSimultaneos: block.professionalsRequested ?? 1,
    plantillaSeleccionada: block.selectedProfessionals ?? 1,
    specificDates: parseJsonArray<string>(block.specificDates, []),
    daysOfWeek: parseJsonArray<number>(block.daysOfWeek, [1, 2, 3, 4, 5]),
    holidayTypesExcluded: parseJsonArray<string>(block.holidayTypesExcluded, []),
    enabledSurcharges: parseJsonArray<string>(block.enabledSurcharges, []),
  }
}

function deserializeBudget(budget: any): any {
  return {
    ...budget,
    serviceBlocks: budget.serviceBlocks?.map(deserializeServiceBlock) ?? [],
  }
}

async function getValidCostingQuote(userId: string, token: unknown) {
  if (typeof token !== 'string' || !token) return null
  const quote = await db.costingQuote.findUnique({ where: { id: token } })
  if (!quote || quote.userId !== userId || quote.usedAt || quote.expiresAt <= new Date()) return null
  return quote
}

function blocksFromCostingSnapshot(snapshot: string): Record<string, any>[] | null {
  try {
    const parsed = JSON.parse(snapshot)
    if (!Array.isArray(parsed.serviceBlocks) || !Array.isArray(parsed.schedules)) return null
    return parsed.serviceBlocks.map((block: Record<string, any>, index: number) => ({
      ...block,
      ...(parsed.schedules[index] ?? {}),
      blockSubtotal: parsed.schedules[index]?.initialPriceExVat ?? parsed.schedules[index]?.subtotal ?? 0,
    }))
  } catch {
    return null
  }
}

function locationFromCostingSnapshot(snapshot: string): {
  serviceLocationId: string
  serviceAutonomousCommunity: string
  serviceProvince: string
  serviceMunicipality: string | null
} | null {
  try {
    const parsed = JSON.parse(snapshot)
    const location = parsed.location
    if (!location?.cc || !location?.province) return null
    return {
      serviceLocationId: String(location.id || 'custom'),
      serviceAutonomousCommunity: String(location.cc),
      serviceProvince: String(location.province),
      serviceMunicipality: location.municipality ? String(location.municipality) : null,
    }
  } catch {
    return null
  }
}

function approvalTriggerFromSnapshot(snapshot: string): {
  required: boolean
  discountPercent: number
  semaphore: string | null
  reason: string
} {
  try {
    const commercial = JSON.parse(snapshot)?.commercial
    const discountPercent = Number(commercial?.clientDiscountPercentOfList ?? 0)
    const semaphore = typeof commercial?.semaphore === 'string' ? commercial.semaphore : null
    const reasons: string[] = []
    if (discountPercent > 0) reasons.push(`descuento del ${discountPercent.toFixed(2)} %`)
    if (semaphore && semaphore !== 'green') reasons.push(`semáforo ${semaphore}`)
    return {
      required: reasons.length > 0,
      discountPercent,
      semaphore,
      reason: reasons.length ? `Revisión requerida por ${reasons.join(' y ')}` : '',
    }
  } catch {
    return { required: false, discountPercent: 0, semaphore: null, reason: '' }
  }
}

async function ensureBudgetApproval(params: {
  budgetId: string
  budgetCode: string
  requesterId: string
  requesterRole: string
  snapshot: string
}) {
  if (params.requesterRole === 'maestro') return
  const trigger = approvalTriggerFromSnapshot(params.snapshot)
  if (!trigger.required) return
  const existing = await db.budgetApproval.findFirst({
    where: { budgetId: params.budgetId, status: 'pending' },
  })
  if (existing) return
  await db.budgetApproval.create({
    data: {
      budgetId: params.budgetId,
      requesterId: params.requesterId,
      reason: trigger.reason,
      discountPercent: trigger.discountPercent,
      semaphore: trigger.semaphore,
    },
  })
  const maestros = await db.user.findMany({ where: { active: true, role: 'maestro' }, select: { id: true } })
  if (maestros.length) {
    await db.notification.createMany({
      data: maestros.map(({ id }) => ({
        userId: id,
        type: 'approval_requested',
        title: `Presupuesto ${params.budgetCode} pendiente de aprobación`,
        body: trigger.reason,
        linkView: 'communications',
        entityId: params.budgetId,
      })),
    })
  }
}

function sanitizeBudgetForCommercial(budget: any): any {
  const { internalNotes, serviceBlocks, ...rest } = budget
  const cleanBlocks = serviceBlocks?.map((block: any) => {
    const { internalCostPerHour, internalMargin, pricePerHour, fixedPrice, ...cleanBlock } = block
    return cleanBlock
  })
  return { ...rest, serviceBlocks: cleanBlocks }
}

function sanitizeBudgetsForRole(data: { budgets: any[] }, role: string) {
  if (role === 'admin' || role === 'maestro') return data
  return { budgets: data.budgets.map(sanitizeBudgetForCommercial) }
}

function canAccessAllBudgets(role: string): boolean {
  return role === 'admin' || role === 'maestro'
}

function canAccessBudget(auth: { id: string; role: string }, budget: { createdById: string }): boolean {
  return canAccessAllBudgets(auth.role) || budget.createdById === auth.id
}

function rejectedBudgetConflict(): BudgetAcceptedConflict {
  return new BudgetAcceptedConflict('Un presupuesto rechazado está cerrado y no puede modificarse.')
}

function expiredBudgetConflict(): BudgetAcceptedConflict {
  return new BudgetAcceptedConflict('Un presupuesto caducado está cerrado y no puede modificarse. Cree una nueva versión vigente.')
}

async function lockMutableBudget(tx: any, budgetId: string) {
  const rows = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT "status" FROM "Budget" WHERE "id" = ${budgetId} FOR UPDATE
  `
  if (!rows[0]) throw new BudgetAcceptedConflict('Presupuesto no encontrado')
  if (rows[0].status === 'aceptado') {
    throw new BudgetAcceptedConflict('Un presupuesto aceptado es inmutable. Cree una nueva versión para realizar cambios.')
  }
  if (rows[0].status === 'rechazado') throw rejectedBudgetConflict()
  if (rows[0].status === 'caducado') throw expiredBudgetConflict()
}

async function sealPersistedBudget(
  tx: any,
  budgetId: string,
  userId: string,
  quoteSnapshot: string,
  createdAt = new Date(),
) {
  const persisted = await tx.budget.findUnique({
    where: { id: budgetId },
    include: {
      client: true,
      serviceBlocks: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!persisted) throw new BudgetSealConflict('Presupuesto no encontrado al sellar')

  return sealBudgetArtifactWithClient(tx, {
    budgetId,
    createdById: userId,
    createdAt,
    payload: (version) => buildPersistedBudgetSealPayload({
      budget: persisted,
      quoteSnapshot,
      version,
      emittedAt: createdAt,
    }),
  })
}

async function latestUsedQuoteSnapshot(client: any, budgetId: string): Promise<string | null> {
  const quote = await client.costingQuote.findFirst({
    where: { budgetId, usedAt: { not: null } },
    orderBy: { usedAt: 'desc' },
    select: { snapshot: true },
  })
  return quote?.snapshot ?? null
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const status = searchParams.get('status')
    const clientId = searchParams.get('clientId')
    const search = searchParams.get('search')
    const where: Record<string, unknown> = {}
    if (!canAccessAllBudgets(auth.role)) where.createdById = auth.id
    if (id) where.id = id
    if (status) where.status = status
    if (clientId) where.clientId = clientId
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
        serviceBlocks: { orderBy: { sortOrder: 'asc' } },
        client: { select: { businessName: true, cif: true } },
        createdBy: { select: { name: true } },
        _count: { select: { serviceBlocks: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (id && budgets.length === 0) {
      return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 })
    }
    return NextResponse.json(sanitizeBudgetsForRole({ budgets: budgets.map(deserializeBudget) }, auth.role))
  } catch (error) {
    console.error('[GET /api/budgets] Error:', error)
    return NextResponse.json({ error: 'Error al obtener presupuestos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const body = await readBudgetBody(request)
    if (!body) return badBudgetRequest('El cuerpo JSON del presupuesto no es válido')
    if (hasInvalidBudgetStatus(body.status)) return badBudgetRequest('Estado de presupuesto no válido')
    const {
      clientId,
      status = 'borrador' as BudgetStatus,
      validUntil,
      description,
      clientNotes,
      internalNotes,
      calculationToken,
    } = body

    const previewQuote = await getValidCostingQuote(auth.id, calculationToken)
    if (!previewQuote) {
      return NextResponse.json({ error: 'La cotización económica falta, ha caducado o ya fue utilizada. Vuelve a calcular.' }, { status: 409 })
    }
    const quotedBlocks = blocksFromCostingSnapshot(previewQuote.snapshot)
    const quotedLocation = locationFromCostingSnapshot(previewQuote.snapshot)
    if (!quotedBlocks?.length) {
      return NextResponse.json({ error: 'La cotización económica no contiene bloques válidos. Vuelve a calcular.' }, { status: 409 })
    }
    if (!quotedLocation) {
      return NextResponse.json({ error: 'La cotización económica no contiene una zona de servicio válida. Vuelve a calcular.' }, { status: 409 })
    }

    let resolvedClientId = clientId
    if (clientId && !clientId.startsWith('cmr')) {
      const client = await db.client.findFirst({ where: { cif: clientId } })
      if (client) resolvedClientId = client.id
    }

    const todayCount = await db.budget.count({ where: { code: { startsWith: todayPrefix() } } })
    const code = generateBudgetCode(todayCount)
    const canSeeInternal = auth.role === 'admin' || auth.role === 'maestro'
    const sealedAt = new Date()

    const result = await db.$transaction(async (tx) => {
      const costingQuote = await claimCostingQuote(tx, auth.id, calculationToken, sealedAt)
      if (!costingQuote) throw new CostingQuoteConflict('Cotización ya consumida o caducada')

      const budget = await tx.budget.create({
        data: {
          code,
          clientId: resolvedClientId,
          createdById: auth.id,
          status,
          validUntil: validUntil ?? null,
          description: description ?? null,
          subtotal: costingQuote.subtotal as number,
          totalSurcharges: 0,
          discountPercent: costingQuote.discountPercent as number,
          discountAmount: costingQuote.discountAmount as number,
          ivaPercent: costingQuote.ivaPercent as number,
          ivaAmount: costingQuote.ivaAmount as number,
          totalFinal: costingQuote.totalFinal as number,
          clientNotes: clientNotes ?? null,
          internalNotes: canSeeInternal ? (internalNotes ?? null) : null,
          ...quotedLocation,
          serviceBlocks: {
            create: quotedBlocks.map((block, index) => ({
              ...serializeServiceBlockData(block),
              sortOrder: index,
            })) as any,
          },
          history: {
            create: { userId: auth.id, action: 'created', snapshot: costingQuote.snapshot as string },
          },
        },
        include: { serviceBlocks: true, client: true },
      })

      await tx.costingQuote.update({
        where: { id: costingQuote.id as string },
        data: { budgetId: budget.id },
      })
      const artifact = await sealPersistedBudget(tx, budget.id, auth.id, costingQuote.snapshot as string, sealedAt)
      return { budget, artifact, quoteSnapshot: costingQuote.snapshot as string }
    })

    await ensureBudgetApproval({
      budgetId: result.budget.id,
      budgetCode: result.budget.code,
      requesterId: auth.id,
      requesterRole: auth.role,
      snapshot: result.quoteSnapshot,
    })

    exportBudgetLightweight(result.budget.id, {
      id: auth.id, email: auth.email, name: auth.name, role: auth.role,
    }).catch(err => console.error('[POST /api/budgets] Auto-export error:', err))

    const artifactInfo = { version: result.artifact.version, artifactHash: result.artifact.artifactHash }
    if (!canSeeInternal) {
      return NextResponse.json({ budget: sanitizeBudgetForCommercial(result.budget), immutableArtifact: artifactInfo }, { status: 201 })
    }
    return NextResponse.json({ budget: result.budget, immutableArtifact: artifactInfo }, { status: 201 })
  } catch (error) {
    if (error instanceof CostingQuoteConflict) {
      return NextResponse.json({ error: 'La cotización económica ya fue utilizada por otro guardado. Vuelve a calcular.' }, { status: 409 })
    }
    console.error('[POST /api/budgets] Error:', error)
    return NextResponse.json({ error: 'Error al crear presupuesto' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const body = await readBudgetBody(request)
    if (!body) return badBudgetRequest('El cuerpo JSON del presupuesto no es válido')
    if (hasInvalidBudgetStatus(body.status)) return badBudgetRequest('Estado de presupuesto no válido')
    const { id, serviceBlocks, calculationToken, ...updateData } = body
    if (!id) return NextResponse.json({ error: 'Se requiere el ID del presupuesto' }, { status: 400 })

    const existing = await db.budget.findUnique({ where: { id } })
    if (!existing || !canAccessBudget(auth, existing)) {
      return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 })
    }
    if (existing.status === 'aceptado') {
      return NextResponse.json({ error: 'Un presupuesto aceptado es inmutable. Cree una nueva versión para realizar cambios.' }, { status: 409 })
    }
    if (existing.status === 'rechazado') {
      return NextResponse.json({ error: rejectedBudgetConflict().message }, { status: 409 })
    }
    if (existing.status === 'caducado') {
      return NextResponse.json({ error: expiredBudgetConflict().message }, { status: 409 })
    }

    const updatesEconomicData = serviceBlocks !== undefined || [
      'subtotal', 'totalSurcharges', 'discountPercent', 'discountAmount',
      'ivaPercent', 'ivaAmount', 'totalFinal', 'serviceLocationId',
      'serviceAutonomousCommunity', 'serviceProvince', 'serviceMunicipality',
    ].some((key) => updateData[key] !== undefined)

    const previewQuote = updatesEconomicData ? await getValidCostingQuote(auth.id, calculationToken) : null
    if (updatesEconomicData && !previewQuote) {
      return NextResponse.json({ error: 'La cotización económica falta, ha caducado o ya fue utilizada. Vuelve a calcular.' }, { status: 409 })
    }
    const processedBlocks = previewQuote ? blocksFromCostingSnapshot(previewQuote.snapshot) : undefined
    const quotedLocation = previewQuote ? locationFromCostingSnapshot(previewQuote.snapshot) : null
    if (previewQuote && !processedBlocks?.length) {
      return NextResponse.json({ error: 'La cotización económica no contiene bloques válidos. Vuelve a calcular.' }, { status: 409 })
    }
    if (previewQuote && !quotedLocation) {
      return NextResponse.json({ error: 'La cotización económica no contiene una zona de servicio válida. Vuelve a calcular.' }, { status: 409 })
    }

    const historyEntries: any[] = []
    if (updateData.status && updateData.status !== existing.status) {
      historyEntries.push({
        userId: auth.id, action: 'status_changed', oldStatus: existing.status, newStatus: updateData.status,
      })
    }
    historyEntries.push({ userId: auth.id, action: 'modified', snapshot: previewQuote?.snapshot ?? null })

    const {
      clientId, status, validUntil, description,
      clientNotes, internalNotes,
    } = updateData
    const canSeeInternal = auth.role === 'admin' || auth.role === 'maestro'
    const sealedAt = new Date()

    const result = await db.$transaction(async (tx) => {
      await lockMutableBudget(tx, id)
      const costingQuote = previewQuote
        ? await claimCostingQuote(tx, auth.id, calculationToken, sealedAt)
        : null
      if (previewQuote && !costingQuote) throw new CostingQuoteConflict('Cotización ya consumida o caducada')

      if (processedBlocks !== undefined) {
        await tx.serviceBlock.deleteMany({ where: { budgetId: id } })
      }

      const updated = await tx.budget.update({
        where: { id },
        data: {
          ...(clientId !== undefined && { clientId }),
          ...(status !== undefined && { status }),
          ...(validUntil !== undefined && { validUntil: validUntil ?? null }),
          ...(description !== undefined && { description: description ?? null }),
          ...(costingQuote ? {
            subtotal: costingQuote.subtotal as number,
            totalSurcharges: 0,
            discountPercent: costingQuote.discountPercent as number,
            discountAmount: costingQuote.discountAmount as number,
            ivaPercent: costingQuote.ivaPercent as number,
            ivaAmount: costingQuote.ivaAmount as number,
            totalFinal: costingQuote.totalFinal as number,
          } : {}),
          ...(clientNotes !== undefined && { clientNotes: clientNotes ?? null }),
          ...(canSeeInternal && internalNotes !== undefined && { internalNotes: internalNotes ?? null }),
          ...(quotedLocation ?? {}),
          ...(processedBlocks?.length ? {
            serviceBlocks: {
              create: processedBlocks.map((block, index) => ({
                ...serializeServiceBlockData(block), sortOrder: index,
              })) as any,
            },
          } : {}),
          history: { create: historyEntries },
        },
        include: {
          serviceBlocks: { orderBy: { sortOrder: 'asc' } },
          client: { select: { businessName: true, cif: true } },
          createdBy: { select: { name: true } },
        },
      })

      if (costingQuote) {
        await tx.costingQuote.update({
          where: { id: costingQuote.id as string },
          data: { budgetId: id },
        })
      }
      const quoteSnapshot = costingQuote?.snapshot as string | undefined
        ?? await latestUsedQuoteSnapshot(tx, id)
      if (!quoteSnapshot) throw new BudgetSealConflict('El presupuesto no conserva una cotización económica auditable')
      const artifact = await sealPersistedBudget(tx, id, auth.id, quoteSnapshot, sealedAt)
      return { updated, artifact, quoteSnapshot }
    })

    if (previewQuote) {
      await ensureBudgetApproval({
        budgetId: result.updated.id,
        budgetCode: result.updated.code,
        requesterId: auth.id,
        requesterRole: auth.role,
        snapshot: result.quoteSnapshot,
      })
    }

    exportBudgetLightweight(result.updated.id, {
      id: auth.id, email: auth.email, name: auth.name, role: auth.role,
    }).catch(err => console.error('[PUT /api/budgets] Auto-export error:', err))

    const artifactInfo = { version: result.artifact.version, artifactHash: result.artifact.artifactHash }
    if (!canSeeInternal) {
      return NextResponse.json({ budget: sanitizeBudgetForCommercial(result.updated), immutableArtifact: artifactInfo })
    }
    return NextResponse.json({ budget: result.updated, immutableArtifact: artifactInfo })
  } catch (error) {
    if (error instanceof CostingQuoteConflict) {
      return NextResponse.json({ error: 'La cotización económica ya fue utilizada por otro guardado. Vuelve a calcular.' }, { status: 409 })
    }
    if (error instanceof BudgetSealConflict || error instanceof BudgetAcceptedConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('[PUT /api/budgets] Error:', error)
    return NextResponse.json({ error: 'Error al actualizar presupuesto' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Se requiere el ID del presupuesto' }, { status: 400 })

    const existing = await db.budget.findUnique({ where: { id } })
    if (!existing || !canAccessBudget(auth, existing)) {
      return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 })
    }
    if (existing.status === 'aceptado') {
      return NextResponse.json({ error: 'Un presupuesto aceptado es inmutable. Cree una nueva versión para realizar cambios.' }, { status: 409 })
    }
    if (existing.status === 'rechazado') {
      return NextResponse.json({ error: rejectedBudgetConflict().message }, { status: 409 })
    }
    if (existing.status === 'caducado') {
      return NextResponse.json({ error: expiredBudgetConflict().message }, { status: 409 })
    }
    const sealedAt = new Date()

    const artifact = await db.$transaction(async (tx) => {
      await lockMutableBudget(tx, id)
      const quoteSnapshot = await latestUsedQuoteSnapshot(tx, id)
      if (!quoteSnapshot) throw new BudgetSealConflict('El presupuesto no conserva una cotización económica auditable')
      await tx.budget.update({
        where: { id },
        data: {
          status: 'caducado',
          history: { create: {
            userId: auth.id, action: 'status_changed', oldStatus: existing.status, newStatus: 'caducado',
          } },
        },
      })
      return sealPersistedBudget(tx, id, auth.id, quoteSnapshot, sealedAt)
    })

    exportBudgetLightweight(id, {
      id: auth.id, email: auth.email, name: auth.name, role: auth.role,
    }).catch(err => console.error('[DELETE /api/budgets] Auto-export error:', err))

    return NextResponse.json({
      success: true,
      immutableArtifact: { version: artifact.version, artifactHash: artifact.artifactHash },
    })
  } catch (error) {
    if (error instanceof BudgetSealConflict || error instanceof BudgetAcceptedConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('[DELETE /api/budgets] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar presupuesto' }, { status: 500 })
  }
}
