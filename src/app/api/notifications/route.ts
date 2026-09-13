import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { privateNoStoreJson } from '@/lib/private-api-response';

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const params = request.nextUrl.searchParams;
  if ([...params.keys()].length > 0) {
    return privateNoStoreJson({ error: 'Parámetros no admitidos' }, { status: 400 });
  }

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: auth.id }, orderBy: { createdAt: 'desc' }, take: 100,
    }),
    db.notification.count({ where: { userId: auth.id, readAt: null } }),
  ]);

  return privateNoStoreJson({ notifications, unreadCount });
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
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return privateNoStoreJson({ error: 'Solicitud no válida' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  if (!hasOnlyKeys(input, ['id', 'all'])) {
    return privateNoStoreJson({ error: 'Solicitud no válida' }, { status: 400 });
  }

  const { id, all } = input;
  if (id !== undefined && (typeof id !== 'string' || !id.trim())) {
    return privateNoStoreJson({ error: 'Identificador de notificación no válido' }, { status: 400 });
  }
  if (all !== undefined && typeof all !== 'boolean') {
    return privateNoStoreJson({ error: 'Indicador all no válido' }, { status: 400 });
  }

  const markOne = typeof id === 'string' && id.trim().length > 0 && all === undefined;
  const markAll = id === undefined && all === true;
  if (!markOne && !markAll) {
    return privateNoStoreJson({ error: 'Selector de notificación no válido' }, { status: 400 });
  }

  await db.notification.updateMany({
    where: {
      userId: auth.id,
      ...(markAll ? {} : { id: (id as string).trim() }),
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return privateNoStoreJson({ success: true });
}
