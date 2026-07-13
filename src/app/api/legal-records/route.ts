import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, requireMaestro, logAudit } from '@/lib/auth';

// ─── GET /api/legal-records ─────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const where: Record<string, unknown> = { isActive: true };
    if (category) {
      where.category = category;
    }

    const records = await db.legalRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error('[GET /api/legal-records] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener los registros normativos' },
      { status: 500 },
    );
  }
}

// ─── POST /api/legal-records ───────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const {
      title,
      category,
      norm,
      location,
      reference,
      eliUrl,
      officialUrl,
      hasLiteralQuote,
      literalQuote,
      quoteSource,
      operativeSummary,
      status,
      sourceType,
      reviewDate,
      internalNotes,
    } = body;

    if (!title || !category || !norm) {
      return NextResponse.json(
        { error: 'Los campos title, category y norm son obligatorios' },
        { status: 400 },
      );
    }

    const record = await db.legalRecord.create({
      data: {
        key: body.key || `lr_${Date.now()}`,
        title,
        category,
        norm,
        location,
        reference,
        eliUrl,
        officialUrl,
        hasLiteralQuote: hasLiteralQuote ?? false,
        literalQuote,
        quoteSource,
        operativeSummary,
        status,
        sourceType,
        reviewDate,
        internalNotes,
      },
    });

    await logAudit({
      action: 'legal_record_created',
      entity: 'legalRecord',
      entityId: record.id,
      userId: auth.id,
      userName: auth.name,
      userRole: auth.role,
      summary: `Registro normativo creado: ${record.title} (${record.reference || record.norm})`,
      newData: JSON.stringify({ title, category, norm, reference, status, sourceType }),
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('[POST /api/legal-records] Error:', error);
    return NextResponse.json(
      { error: 'Error al crear el registro normativo' },
      { status: 500 },
    );
  }
}

// ─── PUT /api/legal-records ───────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Se requiere el campo id' },
        { status: 400 },
      );
    }

    const existing = await db.legalRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Registro normativo no encontrado' },
        { status: 404 },
      );
    }

    // Strip immutable fields
    const { createdAt, updatedAt, legalParameters, ...data } = fields as any;

    const record = await db.legalRecord.update({
      where: { id },
      data,
    });

    await logAudit({
      action: 'legal_record_updated',
      entity: 'legalRecord',
      entityId: id,
      userId: auth.id,
      userName: auth.name,
      userRole: auth.role,
      summary: `Registro normativo actualizado: ${record.title}`,
      oldData: JSON.stringify({ title: existing.title, category: existing.category, status: existing.status }),
      newData: JSON.stringify(data),
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error('[PUT /api/legal-records] Error:', error);
    return NextResponse.json(
      { error: 'Error al actualizar el registro normativo' },
      { status: 500 },
    );
  }
}

// ─── DELETE /api/legal-records?id=xxx ──────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireMaestro(request);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Se requiere el parámetro id' },
        { status: 400 },
      );
    }

    const existing = await db.legalRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Registro normativo no encontrado' },
        { status: 404 },
      );
    }

    await db.legalRecord.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      action: 'legal_record_deleted',
      entity: 'legalRecord',
      entityId: id,
      userId: auth.id,
      userName: auth.name,
      userRole: auth.role,
      summary: `Registro normativo desactivado: ${existing.title}`,
      oldData: JSON.stringify({ title: existing.title, status: existing.status }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/legal-records] Error:', error);
    return NextResponse.json(
      { error: 'Error al eliminar el registro normativo' },
      { status: 500 },
    );
  }
}
