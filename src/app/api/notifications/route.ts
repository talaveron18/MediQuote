import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const notifications = await db.notification.findMany({
    where: { userId: auth.id }, orderBy: { createdAt: 'desc' }, take: 100,
  });
  return NextResponse.json({
    notifications,
    unreadCount: notifications.filter((item) => !item.readAt).length,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id, all } = await request.json() as { id?: string; all?: boolean };
  if (!id && !all) return NextResponse.json({ error: 'Falta la notificación' }, { status: 400 });
  await db.notification.updateMany({
    where: { userId: auth.id, ...(all ? {} : { id }), readAt: null }, data: { readAt: new Date() },
  });
  return NextResponse.json({ success: true });
}

