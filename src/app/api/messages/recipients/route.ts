import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { privateNoStoreJson } from '@/lib/private-api-response';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (new URL(request.url).searchParams.size > 0) {
    return privateNoStoreJson({ error: 'Parámetros de consulta no admitidos' }, { status: 400 });
  }

  const users = await db.user.findMany({
    where: { active: true, id: { not: auth.id } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  });
  return privateNoStoreJson({ users });
}
