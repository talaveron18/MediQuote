import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response'

const CLIENT_FIELDS = new Set([
  'businessName', 'cif', 'fiscalAddress', 'contactPerson', 'email', 'phone', 'sector', 'paymentTerms', 'notes',
])

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readObjectBody(request: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return privateNoStoreJson({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 })
  }
  if (!isJsonObject(body)) {
    return privateNoStoreJson({ error: 'El cuerpo debe ser un objeto JSON' }, { status: 400 })
  }
  return body
}

function unsupportedBodyFields(body: Record<string, unknown>, allowed: Set<string>): string[] {
  return Object.keys(body).filter((field) => !allowed.has(field))
}

function validateQueryContract(searchParams: URLSearchParams, allowed: Set<string>): string | null {
  const keys = Array.from(searchParams.keys())
  const unsupported = [...new Set(keys.filter((key) => !allowed.has(key)))]
  if (unsupported.length > 0) return `Parámetros no permitidos: ${unsupported.join(', ')}`

  for (const key of allowed) {
    if (searchParams.getAll(key).length > 1) return `El parámetro ${key} no puede repetirse`
  }

  return null
}

// ─── GET /api/clients ──────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const queryError = validateQueryContract(searchParams, new Set(['search']))
    if (queryError) {
      return privateNoStoreJson({ error: queryError }, { status: 400 })
    }

    const search = searchParams.get('search')

    const clients = await db.client.findMany({
      where: search
        ? {
            OR: [
              { businessName: { contains: search } },
              { cif: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { businessName: 'asc' },
    })

    return privateNoStoreJson(clients)
  } catch (error) {
    console.error('Error fetching clients:', error)
    return genericInternalErrorResponse('Error al obtener los clientes')
  }
}

// ─── POST /api/clients ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await readObjectBody(request)
    if (body instanceof NextResponse) return body

    const unsupportedFields = unsupportedBodyFields(body, CLIENT_FIELDS)
    if (unsupportedFields.length > 0) {
      return privateNoStoreJson(
        { error: `Campos no permitidos: ${unsupportedFields.join(', ')}` },
        { status: 400 },
      )
    }

    const { businessName, cif, fiscalAddress, contactPerson, email, phone, sector, paymentTerms, notes } = body

    if (typeof businessName !== 'string' || !businessName.trim()
      || typeof cif !== 'string' || !cif.trim()
      || typeof fiscalAddress !== 'string' || !fiscalAddress.trim()) {
      return privateNoStoreJson(
        { error: 'Los campos businessName, cif y fiscalAddress son obligatorios y deben ser texto' },
        { status: 400 },
      )
    }

    const optionalText = { contactPerson, email, phone, sector, paymentTerms, notes }
    for (const [field, value] of Object.entries(optionalText)) {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        return privateNoStoreJson({ error: `El campo ${field} debe ser texto` }, { status: 400 })
      }
    }

    const client = await db.client.create({
      data: {
        businessName: businessName.trim(),
        cif: cif.trim(),
        fiscalAddress: fiscalAddress.trim(),
        contactPerson: typeof contactPerson === 'string' ? contactPerson : undefined,
        email: typeof email === 'string' ? email : undefined,
        phone: typeof phone === 'string' ? phone : undefined,
        sector: typeof sector === 'string' ? sector : undefined,
        paymentTerms: typeof paymentTerms === 'string' ? paymentTerms : undefined,
        notes: typeof notes === 'string' ? notes : undefined,
      },
    })

    return privateNoStoreJson(client, { status: 201 })
  } catch (error) {
    console.error('Error creating client:', error)
    return genericInternalErrorResponse('Error al crear el cliente')
  }
}

// ─── PUT /api/clients ──────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await readObjectBody(request)
    if (body instanceof NextResponse) return body
    const { id, ...fields } = body

    if (typeof id !== 'string' || !id.trim()) {
      return privateNoStoreJson(
        { error: 'Se requiere el campo id como texto' },
        { status: 400 },
      )
    }

    const unsupportedFields = unsupportedBodyFields(fields, CLIENT_FIELDS)
    if (unsupportedFields.length > 0) {
      return privateNoStoreJson(
        { error: `Campos no permitidos: ${unsupportedFields.join(', ')}` },
        { status: 400 },
      )
    }

    const requiredFields = new Set(['businessName', 'cif', 'fiscalAddress'])
    const data: Record<string, string | null> = {}
    for (const [field, value] of Object.entries(fields)) {
      if (requiredFields.has(field)) {
        if (typeof value !== 'string' || !value.trim()) {
          return privateNoStoreJson(
            { error: `El campo ${field} es obligatorio y debe ser texto no vacío` },
            { status: 400 },
          )
        }
        data[field] = value.trim()
        continue
      }

      if (value !== null && typeof value !== 'string') {
        return privateNoStoreJson({ error: `El campo ${field} debe ser texto` }, { status: 400 })
      }
      data[field] = typeof value === 'string' ? value : null
    }

    if (Object.keys(data).length === 0) {
      return privateNoStoreJson(
        { error: 'Se requiere al menos un campo editable' },
        { status: 400 },
      )
    }

    const client = await db.client.update({
      where: { id: id.trim() },
      data,
    })

    return privateNoStoreJson(client)
  } catch (error) {
    console.error('Error updating client:', error)
    return genericInternalErrorResponse('Error al actualizar el cliente')
  }
}

// ─── DELETE /api/clients?id=xxx ────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const queryError = validateQueryContract(searchParams, new Set(['id']))
    if (queryError) {
      return privateNoStoreJson({ error: queryError }, { status: 400 })
    }

    const id = searchParams.get('id')
    if (!id?.trim()) {
      return privateNoStoreJson(
        { error: 'Se requiere el parámetro id' },
        { status: 400 },
      )
    }
    const normalizedId = id.trim()

    const deletion = await db.$transaction(async (tx) => {
      const budgetCount = await tx.budget.count({
        where: { clientId: normalizedId },
      })

      if (budgetCount > 0) return { blockedByBudgets: true as const }

      await tx.client.delete({
        where: { id: normalizedId },
      })
      return { blockedByBudgets: false as const }
    }, { isolationLevel: 'Serializable' })

    if (deletion.blockedByBudgets) {
      return privateNoStoreJson(
        { error: 'No se puede eliminar un cliente con presupuestos asociados' },
        { status: 400 },
      )
    }

    return privateNoStoreJson({ success: true })
  } catch (error) {
    console.error('Error deleting client:', error)
    return genericInternalErrorResponse('Error al eliminar el cliente')
  }
}
