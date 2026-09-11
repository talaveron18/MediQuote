import { NextRequest, NextResponse } from 'next/server'
import { requireRole, logAudit } from '@/lib/auth'
import { db } from '@/lib/db'
import { privateNoStoreJson, genericInternalErrorResponse } from '@/lib/private-api-response'
import {
  VERIFIED_LABOR_INPUTS_KEY,
  appendLaborInputVersion,
  parseVerifiedLaborInputStore,
  type LaborInputDraft,
} from '@/lib/costing/verified-labor-inputs'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro'])
    if (auth instanceof NextResponse) return auth
    const row = await db.appConfig.findUnique({ where: { key: VERIFIED_LABOR_INPUTS_KEY } })
    return privateNoStoreJson({ records: parseVerifiedLaborInputStore(row?.value) })
  } catch (error) {
    console.error('[GET /api/verified-labor-costs] Error:', error)
    return genericInternalErrorResponse('Error al consultar los costes laborales verificados')
  }
}

async function appendWithRetry(draft: LaborInputDraft, actorId: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const currentRow = await tx.appConfig.findUnique({ where: { key: VERIFIED_LABOR_INPUTS_KEY } })
        const current = parseVerifiedLaborInputStore(currentRow?.value)
        const appended = appendLaborInputVersion({ current, draft, actorId })
        if (appended.status !== 'ok') return appended
        if (!appended.duplicate) {
          await tx.appConfig.upsert({
            where: { key: VERIFIED_LABOR_INPUTS_KEY },
            create: { key: VERIFIED_LABOR_INPUTS_KEY, value: JSON.stringify(appended.records) },
            update: { value: JSON.stringify(appended.records) },
          })
        }
        return appended
      }, { isolationLevel: 'Serializable' })
    } catch (error) {
      lastError = error
      const code = (error as { code?: string })?.code
      if (code !== 'P2034' && code !== 'P2002') throw error
    }
  }
  throw lastError
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro'])
    if (auth instanceof NextResponse) return auth

    let body: { record?: LaborInputDraft }
    try {
      body = await request.json()
    } catch {
      return privateNoStoreJson({ error: 'El cuerpo debe ser JSON válido.' }, { status: 400 })
    }
    if (!body.record || typeof body.record !== 'object') {
      return privateNoStoreJson({ error: 'Falta record.' }, { status: 400 })
    }

    const result = await appendWithRetry(body.record, auth.id)
    if (result.status === 'invalid') {
      return privateNoStoreJson({ status: 'invalid', issues: result.issues }, { status: 422 })
    }
    if (result.status === 'conflict') {
      await logAudit({
        action: 'verified_labor_cost_conflict_rejected',
        entity: 'VerifiedLaborCost',
        entityId: result.record.id,
        userId: auth.id,
        userName: auth.name,
        userRole: auth.role,
        summary: 'Se rechazó una escritura con identidad de versión existente y contenido distinto.',
        result: 'failure',
      })
      return privateNoStoreJson({ status: 'conflict', issues: result.issues }, { status: 409 })
    }

    await logAudit({
      action: result.duplicate ? 'verified_labor_cost_duplicate_ignored' : 'verified_labor_cost_added',
      entity: 'VerifiedLaborCost',
      entityId: result.record.id,
      userId: auth.id,
      userName: auth.name,
      userRole: auth.role,
      summary: result.duplicate
        ? 'Entrada de gestoría ya existente; no se duplicó.'
        : `Entrada de gestoría ${result.record.status} añadida con trazabilidad de fuente.`,
      result: 'success',
    })

    return privateNoStoreJson({
      status: 'ok',
      duplicate: result.duplicate,
      record: result.record,
    }, { status: result.duplicate ? 200 : 201 })
  } catch (error) {
    console.error('[POST /api/verified-labor-costs] Error:', error)
    return genericInternalErrorResponse('Error al incorporar el coste laboral verificado')
  }
}
