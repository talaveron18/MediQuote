import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logAudit, requireAuth, requireMaestro } from '@/lib/auth';

const messageInclude = {
  sender: { select: { id: true, name: true, email: true, role: true } },
  recipient: { select: { id: true, name: true, email: true, role: true } },
  budget: { select: { id: true, code: true } },
  client: { select: { id: true, businessName: true } },
} as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const box = new URL(request.url).searchParams.get('box') === 'sent' ? 'sent' : 'inbox';
  const messages = await db.internalMessage.findMany({
    where: box === 'sent' ? { senderId: auth.id } : { recipientId: auth.id },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ messages });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json() as {
    recipientId?: string; subject?: string; body?: string; budgetId?: string; clientId?: string;
  };
  const subject = body.subject?.trim();
  const messageBody = body.body?.trim();
  if (!body.recipientId || !subject || !messageBody) {
    return NextResponse.json({ error: 'Destinatario, asunto y mensaje son obligatorios' }, { status: 400 });
  }
  if (subject.length > 180 || messageBody.length > 10_000) {
    return NextResponse.json({ error: 'El asunto o el mensaje supera el tamaño permitido' }, { status: 400 });
  }
  const recipient = await db.user.findFirst({
    where: { id: body.recipientId, active: true }, select: { id: true },
  });
  if (!recipient) return NextResponse.json({ error: 'El destinatario no existe o está desactivado' }, { status: 404 });
  const message = await db.internalMessage.create({
    data: {
      senderId: auth.id,
      recipientId: recipient.id,
      subject,
      body: messageBody,
      budgetId: body.budgetId || null,
      clientId: body.clientId || null,
    },
    include: messageInclude,
  });
  await db.notification.create({
    data: {
      userId: recipient.id,
      type: 'internal_message',
      title: `Nuevo mensaje de ${auth.name}`,
      body: subject,
      linkView: 'communications',
      entityId: message.id,
    },
  });
  return NextResponse.json({ message }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await request.json() as { id?: string };
  if (!id) return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 });
  const updated = await db.internalMessage.updateMany({
    where: { id, recipientId: auth.id, readAt: null }, data: { readAt: new Date() },
  });
  if (!updated.count) return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireMaestro(request);
  if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 });
  const message = await db.internalMessage.findUnique({ where: { id }, select: { id: true, subject: true } });
  if (!message) return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });
  await db.$transaction([
    db.notification.deleteMany({ where: { entityId: id, type: 'internal_message' } }),
    db.internalMessage.delete({ where: { id } }),
  ]);
  await logAudit({
    action: 'internal_message_deleted', entity: 'internal_message', entityId: id,
    userId: auth.id, userName: auth.name, userRole: auth.role,
    summary: `Mensaje eliminado por Maestro: ${message.subject}`,
  });
  return NextResponse.json({ success: true });
}
