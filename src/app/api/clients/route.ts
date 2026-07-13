import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// ─── GET /api/clients ──────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
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

    return NextResponse.json(clients)
  } catch (error) {
    console.error('Error fetching clients:', error)
    return NextResponse.json(
      { error: 'Error al obtener los clientes' },
      { status: 500 },
    )
  }
}

// ─── POST /api/clients ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { businessName, cif, fiscalAddress, contactPerson, email, phone, sector, paymentTerms, notes } = body

    if (!businessName || !cif || !fiscalAddress) {
      return NextResponse.json(
        { error: 'Los campos businessName, cif y fiscalAddress son obligatorios' },
        { status: 400 },
      )
    }

    const client = await db.client.create({
      data: {
        businessName,
        cif,
        fiscalAddress,
        contactPerson,
        email,
        phone,
        sector,
        paymentTerms,
        notes,
      },
    })

    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    console.error('Error creating client:', error)
    return NextResponse.json(
      { error: 'Error al crear el cliente' },
      { status: 500 },
    )
  }
}

// ─── PUT /api/clients ──────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Se requiere el campo id' },
        { status: 400 },
      )
    }

    const { createdAt, updatedAt, budgets, ...data } = fields as any

    const client = await db.client.update({
      where: { id },
      data,
    })

    return NextResponse.json(client)
  } catch (error) {
    console.error('Error updating client:', error)
    return NextResponse.json(
      { error: 'Error al actualizar el cliente' },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/clients?id=xxx ────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Se requiere el parámetro id' },
        { status: 400 },
      )
    }

    // Check if client has budgets
    const budgetCount = await db.budget.count({
      where: { clientId: id },
    })

    if (budgetCount > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar un cliente con presupuestos asociados' },
        { status: 400 },
      )
    }

    await db.client.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting client:', error)
    return NextResponse.json(
      { error: 'Error al eliminar el cliente' },
      { status: 500 },
    )
  }
}