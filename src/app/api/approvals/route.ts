import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requireMaestro } from '@/lib/auth';
import { privateNoStoreJson } from '@/lib/private-api-response';

const include = {
  budget: { select: { id: true, code: true, totalFinal: true, client: { select: { businessName: true } } } },
  requester: { select: { id: true, name: true, email: true, role: true } },
  reviewer: { select: { id: true, name: true } },
} as const;

const approvalStatuses = new Set(['pending', 'approved', 'rejected']);

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

async function readJsonObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => key !== 'status')) {
    return privateNoStoreJson({ error: 'Parámetros de consulta no permitidos' }, { status: 400 });
  }
  const statusValues = params.getAll('status');
  if (statusValues.length > 1) {
    return privateNoStoreJson({ error: 'El estado debe indicarse una sola vez' }, { status: 400 });
  }
  const status = statusValues[0];
  if (status !== undefined && !approvalStatuses.has(status)) {
    return privateNoStoreJson({ error: 'Estado de aprobación no válido' }, { status: 400 });
  }

  const approvals = await db.budgetApproval.findMany({
    where: {
      ...(auth.role === 'maestro' ? {} : { requesterId: auth.id }),
      ...(status ? { status } : {}),
    },
    include,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return privateNoStoreJson({ approvals });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const body = await readJsonObject(request);
  if (!body) {
    return privateNoStoreJson({ error: 'El cuerpo de la solicitud debe ser un objeto JSON válido' }, { status: 400 });
  }
  if (!hasOnlyKeys(body, ['budgetId', 'reason'])) {
    return privateNoStoreJson({ error: 'La solicitud contiene campos no permitidos' }, { status: 400 });
  }
  if (typeof body.budgetId !== 'string' || body.budgetId.trim().length === 0) {
    return privateNoStoreJson({ error: 'Selecciona un presupuesto' }, { status: 400 });
  }
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') {
    return privateNoStoreJson({ error: 'El motivo debe ser texto' }, { status: 400 });
  }
  const budgetId = body.budgetId.trim();
  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    select: { id: true, code: true, createdById: true, discountPercent: true, totalFinal: true },
  });
  if (!budget) return privateNoStoreJson({ error: 'Presupuesto no encontrado' }, { status: 404 });
  if (auth.role === 'comercial' && budget.createdById !== auth.id) {
    return privateNoStoreJson({ error: 'Solo puedes enviar tus propios presupuestos' }, { status: 403 });
  }

  const reason = typeof body.reason === 'string' && body.reason.trim()
    ? body.reason.trim()
    : 'Validación general solicitada por el creador del presupuesto';

  const result = await db.$transaction(async (tx) => {
    const pending = await tx.budgetApproval.findFirst({ where: { budgetId: budget.id, status: 'pending' }, include });
    if (pending) return { approval: pending, alreadyPending: true, created: false };

    const approval = await tx.budgetApproval.create({
      data: {
        budgetId: budget.id, requesterId: auth.id, reason,
        discountPercent: budget.discountPercent, semaphore: null,
      }, include,
    });
    const maestros = await tx.user.findMany({ where: { active: true, role: 'maestro' }, select: { id: true } });
    if (maestros.length) await tx.notification.createMany({ data: maestros.map(({ id }) => ({
      userId: id, type: 'approval_requested',
      title: `Presupuesto ${budget.code} pendiente de validación`, body: reason,
      linkView: 'communications', entityId: budget.id,
    })) });
    await tx.budgetHistory.create({
      data: { budgetId: budget.id, userId: auth.id, action: 'approval_requested', notes: reason },
    });
    return { approval, alreadyPending: false, created: true };
  });

  return privateNoStoreJson(
    { approval: result.approval, ...(result.alreadyPending ? { alreadyPending: true } : {}) },
    { status: result.created ? 201 : 200 },
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireMaestro(request);
  if (auth instanceof NextResponse) return auth;
  const body = await readJsonObject(request);
  if (!body) {
    return privateNoStoreJson({ error: 'El cuerpo de la solicitud debe ser un objeto JSON válido' }, { status: 400 });
  }
  if (!hasOnlyKeys(body, ['id', 'decision', 'comment'])) {
    return privateNoStoreJson({ error: 'La solicitud contiene campos no permitidos' }, { status: 400 });
  }
  if (typeof body.id !== 'string' || body.id.trim().length === 0 || !['approved', 'rejected'].includes(String(body.decision ?? ''))) {
    return privateNoStoreJson({ error: 'La aprobación y la decisión son obligatorias' }, { status: 400 });
  }
  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string') {
    return privateNoStoreJson({ error: 'El comentario debe ser texto' }, { status: 400 });
  }

  const id = body.id.trim();
  const decision = body.decision as 'approved' | 'rejected';
  const comment = typeof body.comment === 'string' ? body.comment.trim() || null : null;

  const approval = await db.$transaction(async (tx) => {
    const claimed = await tx.budgetApproval.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: decision,
        reviewerId: auth.id,
        decisionComment: comment,
        decidedAt: new Date(),
      },
    });
    if (claimed.count !== 1) return null;

    const updated = await tx.budgetApproval.findUnique({ where: { id }, include: { ...include, budget: true } });
    if (!updated) return null;

    await tx.notification.create({
      data: {
        userId: updated.requesterId,
        type: `approval_${decision}`,
        title: `Presupuesto ${updated.budget.code} ${decision === 'approved' ? 'aprobado' : 'rechazado'}`,
        body: comment,
        linkView: 'communications',
        entityId: updated.budgetId,
      },
    });
    await tx.budgetHistory.create({
      data: {
        budgetId: updated.budgetId,
        userId: auth.id,
        action: decision === 'approved' ? 'approval_granted' : 'approval_rejected',
        notes: comment,
      },
    });
    return updated;
  });

  if (!approval) {
    return privateNoStoreJson({ error: 'La solicitud ya no está pendiente' }, { status: 409 });
  }
  return privateNoStoreJson({ approval });
}
