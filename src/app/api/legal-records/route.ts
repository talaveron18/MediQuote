import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, requireMaestro, logAudit } from '@/lib/auth';
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const STRING_FIELDS = [
  'key', 'title', 'category', 'norm', 'location', 'reference', 'eliUrl', 'officialUrl',
  'literalQuote', 'quoteSource', 'operativeSummary', 'status', 'sourceType', 'reviewDate', 'internalNotes',
] as const;

function validateFields(body: Record<string, unknown>, requireCore: boolean): string | null {
  if (requireCore) {
    for (const field of ['title', 'category', 'norm'] as const) {
      if (typeof body[field] !== 'string' || !body[field].trim()) return `El campo ${field} es obligatorio y debe ser texto`;
    }
  }
  for (const field of STRING_FIELDS) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== 'string') return `El campo ${field} debe ser texto`;
  }
  if (body.hasLiteralQuote !== undefined && typeof body.hasLiteralQuote !== 'boolean') {
    return 'El campo hasLiteralQuote debe ser booleano';
  }
  return null;
}

function pickMutableFields(body: Record<string, unknown>): Record<string, string | boolean | null> {
  const data: Record<string, string | boolean | null> = {};
  for (const field of STRING_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field] as string | null;
  }
  if (body.hasLiteralQuote !== undefined) data.hasLiteralQuote = body.hasLiteralQuote as boolean;
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
    const category = new URL(request.url).searchParams.get('category');
    const where: Record<string, unknown> = { isActive: true };
    if (category) where.category = category;
    const records = await db.legalRecord.findMany({ where, orderBy: { createdAt: 'desc' } });
    return privateNoStoreJson(records);
  } catch (error) {
    console.error('[GET /api/legal-records] Error:', error);
    return genericInternalErrorResponse('Error al obtener los registros normativos');
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
    const record = await db.legalRecord.create({
      data: {
        key: typeof data.key === 'string' && data.key.trim() ? data.key : `lr_${Date.now()}`,
        title: data.title as string,
        category: data.category as string,
        norm: data.norm as string,
        location: data.location as string | null | undefined,
        reference: data.reference as string | null | undefined,
        eliUrl: data.eliUrl as string | null | undefined,
        officialUrl: data.officialUrl as string | null | undefined,
        hasLiteralQuote: typeof data.hasLiteralQuote === 'boolean' ? data.hasLiteralQuote : false,
        literalQuote: data.literalQuote as string | null | undefined,
        quoteSource: data.quoteSource as string | null | undefined,
        operativeSummary: data.operativeSummary as string | null | undefined,
        status: data.status as string | undefined,
        sourceType: data.sourceType as string | undefined,
        reviewDate: data.reviewDate as string | null | undefined,
        internalNotes: data.internalNotes as string | null | undefined,
      },
    });
    await logAudit({
      action: 'legal_record_created', entity: 'legalRecord', entityId: record.id,
      userId: auth.id, userName: auth.name, userRole: auth.role,
      summary: `Registro normativo creado: ${record.title} (${record.reference || record.norm})`,
      newData: JSON.stringify({ title: record.title, category: record.category, norm: record.norm, reference: record.reference, status: record.status, sourceType: record.sourceType }),
    });
    return privateNoStoreJson(record, { status: 201 });
  } catch (error) {
    console.error('[POST /api/legal-records] Error:', error);
    return genericInternalErrorResponse('Error al crear el registro normativo');
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
    const existing = await db.legalRecord.findUnique({ where: { id } });
    if (!existing) return privateNoStoreJson({ error: 'Registro normativo no encontrado' }, { status: 404 });

    const data = pickMutableFields(body);
    if (typeof data.key === 'string' && data.key !== existing.key) {
      const duplicate = await db.legalRecord.findUnique({ where: { key: data.key } });
      if (duplicate) return privateNoStoreJson({ error: 'Ya existe un registro con esa clave' }, { status: 409 });
    }
    const record = await db.legalRecord.update({ where: { id }, data });
    await logAudit({
      action: 'legal_record_updated', entity: 'legalRecord', entityId: id,
      userId: auth.id, userName: auth.name, userRole: auth.role,
      summary: `Registro normativo actualizado: ${record.title}`,
      oldData: JSON.stringify({ title: existing.title, category: existing.category, status: existing.status }),
      newData: JSON.stringify(data),
    });
    return privateNoStoreJson(record);
  } catch (error) {
    console.error('[PUT /api/legal-records] Error:', error);
    return genericInternalErrorResponse('Error al actualizar el registro normativo');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireMaestro(request);
    if (auth instanceof NextResponse) return auth;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return privateNoStoreJson({ error: 'Se requiere el parámetro id' }, { status: 400 });
    const existing = await db.legalRecord.findUnique({ where: { id } });
    if (!existing) return privateNoStoreJson({ error: 'Registro normativo no encontrado' }, { status: 404 });
    await db.legalRecord.update({ where: { id }, data: { isActive: false } });
    await logAudit({
      action: 'legal_record_deleted', entity: 'legalRecord', entityId: id,
      userId: auth.id, userName: auth.name, userRole: auth.role,
      summary: `Registro normativo desactivado: ${existing.title}`,
      oldData: JSON.stringify({ title: existing.title, status: existing.status }),
    });
    return privateNoStoreJson({ success: true });
  } catch (error) {
    console.error('[DELETE /api/legal-records] Error:', error);
    return genericInternalErrorResponse('Error al eliminar el registro normativo');
  }
}
