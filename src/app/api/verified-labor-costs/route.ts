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

const REQUIRED_STRING_FIELDS = [
  'conceptKey',
  'categoryId',
  'territory',
  'contractType',
  'unit',
  'effectiveFrom',
  'sourceDocument',
  'sourceDate',
  'status',
] as const

const OPTIONAL_STRING_FIELDS = ['id', 'effectiveTo', 'notes', 'supersedesId'] as const
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function validateRequestRecord(record: Record<string, unknown>): Array<{ field: string; kind: 'invalid' | 'missing'; message: string }> {
  const issues: Array<{ field: string; kind: 'invalid' | 'missing'; message: string }> = []

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = record[field]
    if (typeof value !== 'string') {
      issues.push({ field, kind: value === undefined || value === null ? 'missing' : 'invalid', message: `${field} debe ser texto.` })
    }
  }
  for (const field of OPTIONAL_STRING_FIELDS) {
    const value = record[field]
    if (value !== undefined && value !== null && typeof value !== 'string') {
      issues.push({ field, kind: 'invalid', message: `${field} debe ser texto cuando se informa.` })
    }
  }

  if (typeof record.value !== 'number' || !Number.isFinite(record.value)) {
    issues.push({ field: 'value', kind: 'invalid', message: 'value debe ser un número JSON finito; no se aplican conversiones implícitas.' })
  }

  for (const field of ['effectiveFrom', 'sourceDate'] as const) {
    const value = record[field]
    if (typeof value === 'string' && !isRealIsoDate(value)) {
      issues.push({ field, kind: 'invalid', message: `${field} debe ser una fecha ISO real (YYYY-MM-DD).` })
    }
  }
  if (typeof record.effectiveTo === 'string' && record.effectiveTo && !isRealIsoDate(record.effectiveTo)) {
    issues.push({ field: 'effectiveTo', kind: 'invalid', message: 'effectiveTo debe ser una fecha ISO real (YYYY-MM-DD).' })
  }

  return issues
}

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

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return privateNoStoreJson({ error: 'El cuerpo debe ser JSON válido.' }, { status: 400 })
    }
    if (!isObjectRecord(body)) {
      return privateNoStoreJson({ error: 'El cuerpo debe ser un objeto JSON.' }, { status: 400 })
    }
    if (!isObjectRecord(body.record)) {
      return privateNoStoreJson({ error: 'record debe ser un objeto JSON.' }, { status: 400 })
    }

    const requestIssues = validateRequestRecord(body.record)
    if (requestIssues.length > 0) {
      return privateNoStoreJson({ status: 'invalid', issues: requestIssues }, { status: 422 })
    }

    const result = await appendWithRetry(body.record as unknown as LaborInputDraft, auth.id)
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
