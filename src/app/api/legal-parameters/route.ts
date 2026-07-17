import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, requireMaestro, logAudit } from '@/lib/auth';
import { validateLegalParameterValue } from '@/lib/legal-parameter-validation';

// ─── GET /api/legal-parameters ─────────────────────────────────
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

    const parameters = await db.legalParameter.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        legalRecord: {
          select: { id: true, title: true, reference: true },
        },
      },
    });

    return NextResponse.json(parameters);
  } catch (error) {
    console.error('[GET /api/legal-parameters] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener los parámetros legales' },
      { status: 500 },
    );
  }
}

// ─── POST /api/legal-parameters ─────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const {
      key,
      label,
      value,
      unit,
      category,
      effectiveFrom,
      effectiveTo,
      notes,
      legalRecordId,
    } = body;

    if (!key || !label || !value || !category) {
      return NextResponse.json(
        { error: 'Los campos key, label, value y category son obligatorios' },
        { status: 400 },
      );
    }

    const valueError = validateLegalParameterValue(key, value);
    if (valueError) {
      return NextResponse.json({ error: valueError }, { status: 400 });
    }

    // Check key uniqueness
    const existing = await db.legalParameter.findUnique({ where: { key } });
    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un parámetro con esa clave' },
        { status: 409 },
      );
    }

    const parameter = await db.legalParameter.create({
      data: {
        key,
        label,
        value,
        unit,
        category,
        effectiveFrom,
        effectiveTo,
        notes,
        legalRecordId,
      },
      include: {
        legalRecord: {
          select: { id: true, title: true, reference: true },
        },
      },
    });

    await logAudit({
      action: 'legal_parameter_created',
      entity: 'legalParameter',
      entityId: parameter.id,
      userId: auth.id,
      userName: auth.name,
      userRole: auth.role,
      summary: `Parámetro legal creado: ${parameter.label} (${parameter.key})`,
      newData: JSON.stringify({ key, label, value, unit, category }),
    });

    return NextResponse.json(parameter, { status: 201 });
  } catch (error) {
    console.error('[POST /api/legal-parameters] Error:', error);
    return NextResponse.json(
      { error: 'Error al crear el parámetro legal' },
      { status: 500 },
    );
  }
}

// ─── PUT /api/legal-parameters ─────────────────────────────────
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

    const existing = await db.legalParameter.findUnique({
      where: { id },
      include: {
        legalRecord: {
          select: { id: true, title: true, reference: true },
        },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Parámetro legal no encontrado' },
        { status: 404 },
      );
    }

    const valueError = validateLegalParameterValue(fields.key ?? existing.key, fields.value ?? existing.value);
    if (valueError) {
      return NextResponse.json({ error: valueError }, { status: 400 });
    }

    // If key is being changed, check uniqueness
    if (fields.key && fields.key !== existing.key) {
      const duplicate = await db.legalParameter.findUnique({ where: { key: fields.key } });
      if (duplicate) {
        return NextResponse.json(
          { error: 'Ya existe un parámetro con esa clave' },
          { status: 409 },
        );
      }
    }

    // Strip immutable fields
    const { createdAt, updatedAt, legalRecord, ...data } = fields as any;

    const parameter = await db.legalParameter.update({
      where: { id },
      data,
      include: {
        legalRecord: {
          select: { id: true, title: true, reference: true },
        },
      },
    });

    await logAudit({
      action: 'legal_parameter_updated',
      entity: 'legalParameter',
      entityId: id,
      userId: auth.id,
      userName: auth.name,
      userRole: auth.role,
      summary: `Parámetro legal actualizado: ${existing.label}`,
      oldData: JSON.stringify({ key: existing.key, label: existing.label, value: existing.value }),
      newData: JSON.stringify(data),
    });

    return NextResponse.json(parameter);
  } catch (error) {
    console.error('[PUT /api/legal-parameters] Error:', error);
    return NextResponse.json(
      { error: 'Error al actualizar el parámetro legal' },
      { status: 500 },
    );
  }
}

// ─── DELETE /api/legal-parameters?id=xxx ───────────────────────
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

    const existing = await db.legalParameter.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Parámetro legal no encontrado' },
        { status: 404 },
      );
    }

    await db.legalParameter.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      action: 'legal_parameter_deleted',
      entity: 'legalParameter',
      entityId: id,
      userId: auth.id,
      userName: auth.name,
      userRole: auth.role,
      summary: `Parámetro legal desactivado: ${existing.label}`,
      oldData: JSON.stringify({ key: existing.key, label: existing.label, value: existing.value }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/legal-parameters] Error:', error);
    return NextResponse.json(
      { error: 'Error al eliminar el parámetro legal' },
      { status: 500 },
    );
  }
}
