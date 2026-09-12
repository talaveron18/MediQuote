import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requireMaestro } from '@/lib/auth';
import { privateNoStoreJson } from '@/lib/private-api-response';

const include = {
  budget: { select: { id: true, code: true, totalFinal: true, client: { select: { businessName: true } } } },
  requester: { select: { id: true, name: true, email: true, role: true } },
  reviewer: { select: { id: true, name: true } },
} as const;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  const status = new URL(request.url).searchParams.get('status');
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
  const pending = await db.budgetApproval.findFirst({ where: { budgetId: budget.id, status: 'pending' }, include });
  if (pending) return privateNoStoreJson({ approval: pending, alreadyPending: true });
  const reason = typeof body.reason === 'string' && body.reason.trim()
    ? body.reason.trim()
    : 'Validación general solicitada por el creador del presupuesto';
  const approval = await db.budgetApproval.create({
    data: {
      budgetId: budget.id, requesterId: auth.id, reason,
      discountPercent: budget.discountPercent, semaphore: null,
    }, include,
  });
  const maestros = await db.user.findMany({ where: { active: true, role: 'maestro' }, select: { id: true } });
  if (maestros.length) await db.notification.createMany({ data: maestros.map(({ id }) => ({
    userId: id, type: 'approval_requested',
    title: `Presupuesto ${budget.code} pendiente de validación`, body: reason,
    linkView: 'communications', entityId: budget.id,
  })) });
  await db.budgetHistory.create({
    data: { budgetId: budget.id, userId: auth.id, action: 'approval_requested', notes: reason },
  });
  return privateNoStoreJson({ approval }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireMaestro(request);
  if (auth instanceof NextResponse) return auth;
  const body = await readJsonObject(request);
  if (!body) {
    return privateNoStoreJson({ error: 'El cuerpo de la solicitud debe ser un objeto JSON válido' }, { status: 400 });
  }
  if (typeof body.id !== 'string' || body.id.trim().length === 0 || !['approved', 'rejected'].includes(String(body.decision ?? ''))) {
    return privateNoStoreJson({ error: 'La aprobación y la decisión son obligatorias' }, { status: 400 });
  }
  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string') {
    return privateNoStoreJson({ error: 'El comentario debe ser texto' }, { status: 400 });
  }
  const decision = body.decision as 'approved' | 'rejected';
  const existing = await db.budgetApproval.findUnique({ where: { id: body.id.trim() }, include: { budget: true } });
  if (!existing || existing.status !== 'pending') {
    return privateNoStoreJson({ error: 'La solicitud ya no está pendiente' }, { status: 409 });
  }
  const comment = typeof body.comment === 'string' ? body.comment.trim() || null : null;
  const approval = await db.budgetApproval.update({
    where: { id: existing.id },
    data: {
      status: decision,
      reviewerId: auth.id,
      decisionComment: comment,
      decidedAt: new Date(),
    },
    include,
  });
  await db.notification.create({
    data: {
      userId: existing.requesterId,
      type: `approval_${decision}`,
      title: `Presupuesto ${existing.budget.code} ${decision === 'approved' ? 'aprobado' : 'rechazado'}`,
      body: comment,
      linkView: 'communications',
      entityId: existing.budgetId,
    },
  });
  await db.budgetHistory.create({
    data: {
      budgetId: existing.budgetId,
      userId: auth.id,
      action: decision === 'approved' ? 'approval_granted' : 'approval_rejected',
      notes: comment,
    },
  });
  return privateNoStoreJson({ approval });
}
