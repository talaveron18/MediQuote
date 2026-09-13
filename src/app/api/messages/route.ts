import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logAudit, requireAuth, requireMaestro } from '@/lib/auth';
import { privateNoStoreJson } from '@/lib/private-api-response';
import {
  parseMessageBox,
  parseMessageCreateBody,
  parseMessageReadBody,
  parseSingleMessageId,
} from '@/lib/message-request-contract';

const messageInclude = {
  sender: { select: { id: true, name: true, email: true, role: true } },
  recipient: { select: { id: true, name: true, email: true, role: true } },
  budget: { select: { id: true, code: true } },
  client: { select: { id: true, businessName: true } },
} as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const parsed = parseMessageBox(request.url);
  if (!parsed.ok) return privateNoStoreJson({ error: 'Bandeja no válida' }, { status: 400 });
  const messages = await db.internalMessage.findMany({
    where: parsed.box === 'sent' ? { senderId: auth.id } : { recipientId: auth.id },
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
  const parsed = parseMessageCreateBody(body);
  if (!parsed.ok) {
    return privateNoStoreJson({ error: 'Destinatario, asunto y mensaje son obligatorios y los vínculos deben ser identificadores válidos' }, { status: 400 });
  }
  const { recipientId, subject, body: messageBody, budgetId, clientId } = parsed.value;

  const recipient = await db.user.findFirst({
    where: { id: recipientId, active: true }, select: { id: true },
  });
  if (!recipient) return privateNoStoreJson({ error: 'El destinatario no existe o está desactivado' }, { status: 404 });

  const message = await db.$transaction(async (tx) => {
    const created = await tx.internalMessage.create({
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
    await tx.notification.create({
      data: {
        userId: recipient.id,
        type: 'internal_message',
        title: `Nuevo mensaje de ${auth.name}`,
        body: subject,
        linkView: 'communications',
        entityId: created.id,
      },
    });
    return created;
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
  const parsed = parseMessageReadBody(body);
  if (!parsed.ok) return privateNoStoreJson({ error: 'Falta el mensaje' }, { status: 400 });
  const updated = await db.internalMessage.updateMany({
    where: { id: parsed.id, recipientId: auth.id, readAt: null }, data: { readAt: new Date() },
  });
  if (!updated.count) return privateNoStoreJson({ error: 'Mensaje no encontrado' }, { status: 404 });
  return privateNoStoreJson({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireMaestro(request);
  if (auth instanceof NextResponse) return auth;
  const parsed = parseSingleMessageId(request.url);
  if (!parsed.ok) return privateNoStoreJson({ error: 'Falta el mensaje' }, { status: 400 });
  const message = await db.internalMessage.findUnique({ where: { id: parsed.id }, select: { id: true, subject: true } });
  if (!message) return privateNoStoreJson({ error: 'Mensaje no encontrado' }, { status: 404 });
  await db.$transaction([
    db.notification.deleteMany({ where: { entityId: parsed.id, type: 'internal_message' } }),
    db.internalMessage.delete({ where: { id: parsed.id } }),
  ]);
  await logAudit({
    action: 'internal_message_deleted', entity: 'internal_message', entityId: parsed.id,
    userId: auth.id, userName: auth.name, userRole: auth.role,
    summary: `Mensaje eliminado por Maestro: ${message.subject}`,
  });
  return privateNoStoreJson({ success: true });
}
