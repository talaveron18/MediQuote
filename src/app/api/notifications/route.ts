import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { privateNoStoreJson } from '@/lib/private-api-response';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const notifications = await db.notification.findMany({
    where: { userId: auth.id }, orderBy: { createdAt: 'desc' }, take: 100,
  });
  return privateNoStoreJson({
    notifications,
    unreadCount: notifications.filter((item) => !item.readAt).length,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateNoStoreJson({ error: 'Solicitud JSON no válida' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return privateNoStoreJson({ error: 'Solicitud no válida' }, { status: 400 });
  }
  const { id, all } = body as { id?: unknown; all?: unknown };
  if (id !== undefined && (typeof id !== 'string' || !id.trim())) {
    return privateNoStoreJson({ error: 'Identificador de notificación no válido' }, { status: 400 });
  }
  if (all !== undefined && typeof all !== 'boolean') {
    return privateNoStoreJson({ error: 'Indicador all no válido' }, { status: 400 });
  }
  if ((!id || !String(id).trim()) && all !== true) {
    return privateNoStoreJson({ error: 'Falta la notificación' }, { status: 400 });
  }

  await db.notification.updateMany({
    where: { userId: auth.id, ...(all === true ? {} : { id: String(id).trim() }), readAt: null }, data: { readAt: new Date() },
  });
  return privateNoStoreJson({ success: true });
}
