import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requireMaestro } from '@/lib/auth';

const include = {
  budget: { select: { id: true, code: true, totalFinal: true, client: { select: { businessName: true } } } },
  requester: { select: { id: true, name: true, email: true, role: true } },
  reviewer: { select: { id: true, name: true } },
} as const;

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
  return NextResponse.json({ approvals });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json() as { budgetId?: string; reason?: string };
  if (!body.budgetId) return NextResponse.json({ error: 'Selecciona un presupuesto' }, { status: 400 });
  const budget = await db.budget.findUnique({
    where: { id: body.budgetId },
    select: { id: true, code: true, createdById: true, discountPercent: true, totalFinal: true },
  });
  if (!budget) return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 });
  if (auth.role === 'comercial' && budget.createdById !== auth.id) {
    return NextResponse.json({ error: 'Solo puedes enviar tus propios presupuestos' }, { status: 403 });
  }
  const pending = await db.budgetApproval.findFirst({ where: { budgetId: budget.id, status: 'pending' }, include });
  if (pending) return NextResponse.json({ approval: pending, alreadyPending: true });
  const reason = body.reason?.trim() || 'Validación general solicitada por el creador del presupuesto';
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
  return NextResponse.json({ approval }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireMaestro(request);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json() as { id?: string; decision?: 'approved' | 'rejected'; comment?: string };
  if (!body.id || !['approved', 'rejected'].includes(body.decision ?? '')) {
    return NextResponse.json({ error: 'La aprobación y la decisión son obligatorias' }, { status: 400 });
  }
  const existing = await db.budgetApproval.findUnique({ where: { id: body.id }, include: { budget: true } });
  if (!existing || existing.status !== 'pending') {
    return NextResponse.json({ error: 'La solicitud ya no está pendiente' }, { status: 409 });
  }
  const approval = await db.budgetApproval.update({
    where: { id: existing.id },
    data: {
      status: body.decision,
      reviewerId: auth.id,
      decisionComment: body.comment?.trim() || null,
      decidedAt: new Date(),
    },
    include,
  });
  await db.notification.create({
    data: {
      userId: existing.requesterId,
      type: `approval_${body.decision}`,
      title: `Presupuesto ${existing.budget.code} ${body.decision === 'approved' ? 'aprobado' : 'rechazado'}`,
      body: body.comment?.trim() || null,
      linkView: 'communications',
      entityId: existing.budgetId,
    },
  });
  await db.budgetHistory.create({
    data: {
      budgetId: existing.budgetId,
      userId: auth.id,
      action: body.decision === 'approved' ? 'approval_granted' : 'approval_rejected',
      notes: body.comment?.trim() || null,
    },
  });
  return NextResponse.json({ approval });
}
