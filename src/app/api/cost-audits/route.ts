import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logAudit, requireRole } from '@/lib/auth';
import { calculateAuditDeviation, estimatedBreakdownFromSnapshot, type AuditBreakdown } from '@/lib/continuous-audit';

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

function cleanBreakdown(value: unknown): AuditBreakdown {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== '' && Number.isFinite(Number(item)))
    .map(([key, item]) => [key, Number(item)])) as AuditBreakdown;
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin']);
  if (auth instanceof NextResponse) return auth;
  const params = new URL(request.url).searchParams;
  const documentId = params.get('document');
  if (documentId) {
    const record = await db.costAudit.findUnique({ where: { id: documentId },
      select: { documentData: true, documentName: true, documentType: true } });
    if (!record?.documentData) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    const safeName = (record.documentName || 'justificante').replace(/[\r\n"]/g, '_');
    return new NextResponse(Uint8Array.from(record.documentData), {
      headers: {
        'Content-Type': record.documentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  const audits = await db.costAudit.findMany({
    include: {
      budget: { select: { id: true, code: true, client: { select: { businessName: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' }, take: 200,
  });
  return NextResponse.json({ audits: audits.map(({ documentData, ...audit }) => ({
    ...audit,
    hasDocument: Boolean(documentData),
  })) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin']);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json() as {
    budgetId?: string; actualCost?: number; actualBreakdown?: AuditBreakdown; notes?: string;
    documentName?: string; documentType?: string; documentBase64?: string;
  };
  const actualCost = Number(body.actualCost);
  if (!body.budgetId || !Number.isFinite(actualCost) || actualCost < 0) {
    return NextResponse.json({ error: 'Presupuesto y coste real válido son obligatorios' }, { status: 400 });
  }
  const budget = await db.budget.findUnique({ where: { id: body.budgetId }, select: { id: true, code: true } });
  if (!budget) return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 });
  const quote = await db.costingQuote.findFirst({
    where: { budgetId: budget.id, usedAt: { not: null } }, orderBy: { usedAt: 'desc' }, select: { snapshot: true },
  });
  if (!quote) return NextResponse.json({ error: 'Este presupuesto no conserva una cotización interna auditable' }, { status: 409 });
  let estimated;
  try { estimated = estimatedBreakdownFromSnapshot(quote.snapshot); }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Snapshot no auditable' }, { status: 409 });
  }
  const actualBreakdown = cleanBreakdown(body.actualBreakdown);
  const deviation = calculateAuditDeviation({
    estimatedCost: estimated.total, actualCost, estimatedBreakdown: estimated.breakdown, actualBreakdown,
  });
  let documentData: Buffer | undefined;
  if (body.documentBase64) {
    documentData = Buffer.from(body.documentBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (documentData.byteLength > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ error: 'El justificante supera 4 MB' }, { status: 413 });
    }
  }
  const audit = await db.costAudit.create({
    data: {
      budgetId: budget.id, createdById: auth.id,
      estimatedCost: estimated.total, actualCost,
      deviationAmount: deviation.deviationAmount, deviationPercent: deviation.deviationPercent,
      estimatedBreakdown: JSON.stringify(estimated.breakdown),
      actualBreakdown: JSON.stringify(actualBreakdown),
      analysis: JSON.stringify(deviation.analysis),
      notes: body.notes?.trim() || null,
      documentName: documentData ? (body.documentName?.slice(0, 240) || 'justificante') : null,
      documentType: documentData ? (body.documentType?.slice(0, 120) || 'application/octet-stream') : null,
      documentData: documentData ? Uint8Array.from(documentData) : undefined,
    },
  });
  await logAudit({
    action: 'continuous_cost_audit_created', entity: 'budget', entityId: budget.id,
    userId: auth.id, userName: auth.name, userRole: auth.role,
    summary: `${budget.code}: coste estimado ${estimated.total}, real ${actualCost}, desviación ${deviation.deviationPercent}%`,
  });
  return NextResponse.json({ audit: { ...audit, documentData: undefined, hasDocument: Boolean(documentData) } }, { status: 201 });
}
