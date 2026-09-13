import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, requireMaestro, logAudit } from '@/lib/auth';
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

const MUTABLE_FIELDS = [
  'key', 'label', 'value', 'unit', 'category', 'effectiveFrom', 'effectiveTo', 'notes', 'legalRecordId',
] as const;

function validateFields(body: Record<string, unknown>, requireCore: boolean): string | null {
  if (requireCore) {
    for (const field of ['key', 'label', 'value', 'category'] as const) {
      if (typeof body[field] !== 'string' || !body[field].trim()) return `El campo ${field} es obligatorio y debe ser texto`;
    }
  }
  for (const field of MUTABLE_FIELDS) {
    if (!isOptionalString(body[field])) return `El campo ${field} debe ser texto`;
  }
  return null;
}

function pickMutableFields(body: Record<string, unknown>): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const field of MUTABLE_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field] as string | null;
  }
  return data;
}

async function readObjectBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isPlainObject(body) ? body : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro']);
    if (auth instanceof NextResponse) return auth;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const where: Record<string, unknown> = { isActive: true };
    if (category) where.category = category;
    const parameters = await db.legalParameter.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { legalRecord: { select: { id: true, title: true, reference: true } } },
    });
    return privateNoStoreJson(parameters);
  } catch (error) {
    console.error('[GET /api/legal-parameters] Error:', error);
    return genericInternalErrorResponse('Error al obtener los parámetros legales');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro']);
    if (auth instanceof NextResponse) return auth;
    const body = await readObjectBody(request);
    if (!body) return privateNoStoreJson({ error: 'Solicitud no válida' }, { status: 400 });
    const validationError = validateFields(body, true);
    if (validationError) return privateNoStoreJson({ error: validationError }, { status: 400 });

    const data = pickMutableFields(body);
    const key = data.key as string;
    const existing = await db.legalParameter.findUnique({ where: { key } });
    if (existing) return privateNoStoreJson({ error: 'Ya existe un parámetro con esa clave' }, { status: 409 });

    const parameter = await db.legalParameter.create({
      data: {
        key,
        label: data.label as string,
        value: data.value as string,
        unit: data.unit,
        category: data.category as string,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
        notes: data.notes,
        legalRecordId: data.legalRecordId,
      },
      include: { legalRecord: { select: { id: true, title: true, reference: true } } },
    });
    await logAudit({
      action: 'legal_parameter_created', entity: 'legalParameter', entityId: parameter.id,
      userId: auth.id, userName: auth.name, userRole: auth.role,
      summary: `Parámetro legal creado: ${parameter.label} (${parameter.key})`,
      newData: JSON.stringify({ key: parameter.key, label: parameter.label, value: parameter.value, unit: parameter.unit, category: parameter.category }),
    });
    return privateNoStoreJson(parameter, { status: 201 });
  } catch (error) {
    console.error('[POST /api/legal-parameters] Error:', error);
    return genericInternalErrorResponse('Error al crear el parámetro legal');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro']);
    if (auth instanceof NextResponse) return auth;
    const body = await readObjectBody(request);
    if (!body) return privateNoStoreJson({ error: 'Solicitud no válida' }, { status: 400 });
    if (typeof body.id !== 'string' || !body.id.trim()) return privateNoStoreJson({ error: 'Se requiere el campo id' }, { status: 400 });
    const validationError = validateFields(body, false);
    if (validationError) return privateNoStoreJson({ error: validationError }, { status: 400 });

    const id = body.id;
    const existing = await db.legalParameter.findUnique({
      where: { id }, include: { legalRecord: { select: { id: true, title: true, reference: true } } },
    });
    if (!existing) return privateNoStoreJson({ error: 'Parámetro legal no encontrado' }, { status: 404 });

    const data = pickMutableFields(body);
    if (typeof data.key === 'string' && data.key !== existing.key) {
      const duplicate = await db.legalParameter.findUnique({ where: { key: data.key } });
      if (duplicate) return privateNoStoreJson({ error: 'Ya existe un parámetro con esa clave' }, { status: 409 });
    }

    const parameter = await db.legalParameter.update({
      where: { id }, data,
      include: { legalRecord: { select: { id: true, title: true, reference: true } } },
    });
    await logAudit({
      action: 'legal_parameter_updated', entity: 'legalParameter', entityId: id,
      userId: auth.id, userName: auth.name, userRole: auth.role,
      summary: `Parámetro legal actualizado: ${existing.label}`,
      oldData: JSON.stringify({ key: existing.key, label: existing.label, value: existing.value }),
      newData: JSON.stringify(data),
    });
    return privateNoStoreJson(parameter);
  } catch (error) {
    console.error('[PUT /api/legal-parameters] Error:', error);
    return genericInternalErrorResponse('Error al actualizar el parámetro legal');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireMaestro(request);
    if (auth instanceof NextResponse) return auth;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return privateNoStoreJson({ error: 'Se requiere el parámetro id' }, { status: 400 });
    const existing = await db.legalParameter.findUnique({ where: { id } });
    if (!existing) return privateNoStoreJson({ error: 'Parámetro legal no encontrado' }, { status: 404 });
    await db.legalParameter.update({ where: { id }, data: { isActive: false } });
    await logAudit({
      action: 'legal_parameter_deleted', entity: 'legalParameter', entityId: id,
      userId: auth.id, userName: auth.name, userRole: auth.role,
      summary: `Parámetro legal desactivado: ${existing.label}`,
      oldData: JSON.stringify({ key: existing.key, label: existing.label, value: existing.value }),
    });
    return privateNoStoreJson({ success: true });
  } catch (error) {
    console.error('[DELETE /api/legal-parameters] Error:', error);
    return genericInternalErrorResponse('Error al eliminar el parámetro legal');
  }
}
