import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logAudit, requireRole } from '@/lib/auth';
import {
  calculateAuditDeviation,
  estimatedBreakdownFromSnapshot,
  GESTORIA_COMPONENT_LABELS,
  type AuditBreakdown,
  type GestoriaBreakdown,
  type GestoriaComponentKey,
} from '@/lib/continuous-audit';
import { fingerprintDocument } from '@/lib/immutable-artifact';
import {
  getLatestBudgetArtifact,
  sealBudgetArtifact,
  sealCostAuditArtifactWithClient,
} from '@/lib/economic-artifact-store';
import {
  genericInternalErrorResponse,
  privateNoStoreJson,
  privateNoStoreResponse,
} from '@/lib/private-api-response';

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const GESTORIA_KEYS = new Set<GestoriaComponentKey>(
  Object.keys(GESTORIA_COMPONENT_LABELS) as GestoriaComponentKey[],
);
const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MONEY_TOLERANCE = 0.01;

type BreakdownParseResult =
  | { ok: true; value: GestoriaBreakdown }
  | { ok: false; error: string };

function parseBreakdown(value: unknown): BreakdownParseResult {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'El desglose de gestoría debe ser un objeto de conceptos e importes' };
  }

  const result: GestoriaBreakdown = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!GESTORIA_KEYS.has(key as GestoriaComponentKey)) {
      return { ok: false, error: `Concepto de gestoría no reconocido: ${key}` };
    }
    if (item === '' || item === null || item === undefined) {
      return { ok: false, error: `El concepto ${key} no contiene un importe válido` };
    }
    const amount = Number(item);
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: `El concepto ${key} debe contener un importe numérico no negativo` };
    }
    result[key as GestoriaComponentKey] = amount;
  }
  return { ok: true, value: result };
}

function validateBreakdownTotal(actualCost: number, breakdown: GestoriaBreakdown): string | null {
  const entries = Object.entries(breakdown);
  if (entries.length === 0) return null;

  const suppliedTotal = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  if (suppliedTotal - actualCost > MONEY_TOLERANCE) {
    return 'La suma del desglose de gestoría no puede superar el coste real total';
  }

  if (entries.length === GESTORIA_KEYS.size && Math.abs(suppliedTotal - actualCost) > MONEY_TOLERANCE) {
    return 'El desglose completo de gestoría debe cuadrar con el coste real total';
  }
  return null;
}

function decodeDocumentBase64(value: string): Buffer | null {
  const encoded = value.replace(/^data:[^;]+;base64,/, '').trim();
  if (!encoded || !STRICT_BASE64.test(encoded)) return null;
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.byteLength === 0 || decoded.toString('base64') !== encoded) return null;
  return decoded;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin']);
    if (auth instanceof NextResponse) return auth;
    const params = new URL(request.url).searchParams;
    const documentId = params.get('document');
    if (documentId) {
      const record = await db.costAudit.findUnique({ where: { id: documentId },
        select: { documentData: true, documentName: true } });
      if (!record?.documentData) return privateNoStoreJson({ error: 'Documento no encontrado' }, { status: 404 });
      const safeName = (record.documentName || 'justificante').replace(/[\r\n"\\/]/g, '_').slice(0, 180);
      return privateNoStoreResponse(Uint8Array.from(record.documentData), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${safeName || 'justificante'}"`,
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
    return privateNoStoreJson({ audits: audits.map(({ documentData, ...audit }) => ({
      ...audit,
      hasDocument: Boolean(documentData),
    })) });
  } catch (error) {
    console.error('[GET /api/cost-audits] Error:', error);
    return genericInternalErrorResponse('Error al consultar auditorías de costes');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin']);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json() as {
      budgetId?: string; actualCost?: number; actualBreakdown?: AuditBreakdown; notes?: string;
      documentName?: string; documentType?: string; documentBase64?: string;
    };
    const actualCost = Number(body.actualCost);
    if (!body.budgetId || !Number.isFinite(actualCost) || actualCost < 0) {
      return privateNoStoreJson({ error: 'Presupuesto y coste real válido de gestoría son obligatorios' }, { status: 400 });
    }
    const parsedBreakdown = parseBreakdown(body.actualBreakdown);
    if (!parsedBreakdown.ok) {
      return privateNoStoreJson({ error: parsedBreakdown.error }, { status: 400 });
    }
    const actualBreakdown = parsedBreakdown.value;
    const breakdownTotalError = validateBreakdownTotal(actualCost, actualBreakdown);
    if (breakdownTotalError) {
      return privateNoStoreJson({ error: breakdownTotalError }, { status: 400 });
    }

    const budget = await db.budget.findUnique({
      where: { id: body.budgetId },
      select: { id: true, code: true, createdAt: true, updatedAt: true },
    });
    if (!budget) return privateNoStoreJson({ error: 'Presupuesto no encontrado' }, { status: 404 });
    const quote = await db.costingQuote.findFirst({
      where: { budgetId: budget.id, usedAt: { not: null } }, orderBy: { usedAt: 'desc' }, select: { snapshot: true },
    });
    if (!quote) return privateNoStoreJson({ error: 'Este presupuesto no conserva una cotización interna auditable' }, { status: 409 });
    let estimated;
    try {
      estimated = estimatedBreakdownFromSnapshot(quote.snapshot);
    } catch (error) {
      console.error('[POST /api/cost-audits] Snapshot no auditable:', error);
      return privateNoStoreJson({ error: 'La cotización interna guardada no puede auditarse' }, { status: 409 });
    }
    const deviation = calculateAuditDeviation({
      estimatedCost: estimated.gestoriaTotal,
      actualCost,
      estimatedBreakdown: estimated.breakdown,
      actualBreakdown,
    });
    let documentData: Buffer | undefined;
    if (body.documentBase64 !== undefined) {
      const decoded = decodeDocumentBase64(body.documentBase64);
      if (!decoded) {
        return privateNoStoreJson({ error: 'El justificante no contiene Base64 válido' }, { status: 400 });
      }
      documentData = decoded;
      if (documentData.byteLength > MAX_DOCUMENT_BYTES) {
        return privateNoStoreJson({ error: 'El justificante supera 4 MB' }, { status: 413 });
      }
    }

    let budgetArtifact = await getLatestBudgetArtifact(budget.id);
    if (!budgetArtifact) {
      budgetArtifact = await sealBudgetArtifact({
        budgetId: budget.id,
        createdById: auth.id,
        createdAt: budget.updatedAt ?? budget.createdAt,
        payload: {
          budgetId: budget.id,
          code: budget.code,
          economicSnapshot: JSON.parse(quote.snapshot),
          sealReason: 'audit_baseline',
        },
      });
    }

    const { audit, auditArtifact } = await db.$transaction(async (tx) => {
      const audit = await tx.costAudit.create({
        data: {
          budgetId: budget.id, createdById: auth.id,
          estimatedCost: estimated.gestoriaTotal,
          actualCost,
          deviationAmount: deviation.deviationAmount, deviationPercent: deviation.deviationPercent,
          estimatedBreakdown: JSON.stringify(estimated.breakdown),
          actualBreakdown: JSON.stringify(actualBreakdown),
          analysis: JSON.stringify({ reconciliation: deviation.analysis, internal: deviation.internalAnalysis }),
          notes: body.notes?.trim() || null,
          documentName: documentData ? (body.documentName?.slice(0, 240) || 'justificante') : null,
          documentType: documentData ? (body.documentType?.slice(0, 120) || 'application/octet-stream') : null,
          documentData: documentData ? Uint8Array.from(documentData) : undefined,
        },
      });

      const sourceDocuments = documentData ? [fingerprintDocument(Uint8Array.from(documentData), {
        name: audit.documentName || 'justificante',
        mediaType: audit.documentType,
      })] : [];
      const auditArtifact = await sealCostAuditArtifactWithClient(tx, {
        auditId: audit.id,
        createdById: auth.id,
        sourceDocuments,
        payload: {
          auditId: audit.id,
          budgetId: budget.id,
          budgetCode: budget.code,
          originalBudgetArtifactHash: budgetArtifact.artifactHash,
          estimatedCost: audit.estimatedCost,
          actualCost: audit.actualCost,
          deviationAmount: audit.deviationAmount,
          deviationPercent: audit.deviationPercent,
          estimatedBreakdown: estimated.breakdown,
          actualBreakdown,
          reconciliation: deviation.analysis,
          internalGasiCosts: deviation.internalAnalysis,
          notes: audit.notes,
        },
      });
      return { audit, auditArtifact };
    });

    await logAudit({
      action: 'continuous_cost_audit_created', entity: 'budget', entityId: budget.id,
      userId: auth.id, userName: auth.name, userRole: auth.role,
      summary: `${budget.code}: coste conciliable previsto ${estimated.gestoriaTotal}, gestoría ${actualCost}, desviación ${deviation.deviationPercent}%`,
    });
    return privateNoStoreJson({
      audit: { ...audit, documentData: undefined, hasDocument: Boolean(documentData) },
      immutableArtifact: { version: auditArtifact.version, artifactHash: auditArtifact.artifactHash },
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/cost-audits] Error:', error);
    return genericInternalErrorResponse('Error al registrar la auditoría de costes');
  }
}
