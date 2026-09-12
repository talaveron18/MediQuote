import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logAudit, requireAuth, requireMaestro } from '@/lib/auth';
import { privateNoStoreJson } from '@/lib/private-api-response';

const messageInclude = {
  sender: { select: { id: true, name: true, email: true, role: true } },
  recipient: { select: { id: true, name: true, email: true, role: true } },
  budget: { select: { id: true, code: true } },
  client: { select: { id: true, businessName: true } },
} as const;

function objectBody(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

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
  return privateNoStoreJson({ messages });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateNoStoreJson({ error: 'Solicitud no válida' }, { status: 400 });
  }
  if (!objectBody(body)) return privateNoStoreJson({ error: 'Solicitud no válida' }, { status: 400 });

  const recipientId = typeof body.recipientId === 'string' ? body.recipientId.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const messageBody = typeof body.body === 'string' ? body.body.trim() : '';
  const budgetId = body.budgetId === undefined || body.budgetId === null || body.budgetId === ''
    ? null : typeof body.budgetId === 'string' ? body.budgetId.trim() : undefined;
  const clientId = body.clientId === undefined || body.clientId === null || body.clientId === ''
    ? null : typeof body.clientId === 'string' ? body.clientId.trim() : undefined;

  if (!recipientId || !subject || !messageBody || budgetId === undefined || clientId === undefined) {
    return privateNoStoreJson({ error: 'Destinatario, asunto y mensaje son obligatorios y los vínculos deben ser identificadores válidos' }, { status: 400 });
  }
  if (subject.length > 180 || messageBody.length > 10_000) {
    return privateNoStoreJson({ error: 'El asunto o el mensaje supera el tamaño permitido' }, { status: 400 });
  }
  const recipient = await db.user.findFirst({
    where: { id: recipientId, active: true }, select: { id: true },
  });
  if (!recipient) return privateNoStoreJson({ error: 'El destinatario no existe o está desactivado' }, { status: 404 });
  const message = await db.internalMessage.create({
    data: {
      senderId: auth.id,
      recipientId: recipient.id,
      subject,
      body: messageBody,
      budgetId,
      clientId,
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
  return privateNoStoreJson({ message }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateNoStoreJson({ error: 'Solicitud no válida' }, { status: 400 });
  }
  if (!objectBody(body) || typeof body.id !== 'string' || !body.id.trim()) {
    return privateNoStoreJson({ error: 'Falta el mensaje' }, { status: 400 });
  }
  const id = body.id.trim();
  const updated = await db.internalMessage.updateMany({
    where: { id, recipientId: auth.id, readAt: null }, data: { readAt: new Date() },
  });
  if (!updated.count) return privateNoStoreJson({ error: 'Mensaje no encontrado' }, { status: 404 });
  return privateNoStoreJson({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireMaestro(request);
  if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return privateNoStoreJson({ error: 'Falta el mensaje' }, { status: 400 });
  const message = await db.internalMessage.findUnique({ where: { id }, select: { id: true, subject: true } });
  if (!message) return privateNoStoreJson({ error: 'Mensaje no encontrado' }, { status: 404 });
  await db.$transaction([
    db.notification.deleteMany({ where: { entityId: id, type: 'internal_message' } }),
    db.internalMessage.delete({ where: { id } }),
  ]);
  await logAudit({
    action: 'internal_message_deleted', entity: 'internal_message', entityId: id,
    userId: auth.id, userName: auth.name, userRole: auth.role,
    summary: `Mensaje eliminado por Maestro: ${message.subject}`,
  });
  return privateNoStoreJson({ success: true });
}
