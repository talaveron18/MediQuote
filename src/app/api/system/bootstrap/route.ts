import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response';
import { seedDatabase } from '../../../../../scripts/seed';

export const runtime = 'nodejs';

function readBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

function matchesBootstrapToken(received: string | null): boolean {
  const expected = process.env.GASI_BOOTSTRAP_TOKEN?.trim();
  if (!expected || !received) return false;
  const left = createHash('sha256').update(received).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (new URL(request.url).searchParams.size > 0) {
    return privateNoStoreJson({ error: 'Parámetros de consulta no admitidos' }, { status: 400 });
  }

  const token = readBearerToken(request.headers.get('authorization'));
  if (!matchesBootstrapToken(token)) {
    return privateNoStoreJson({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    if (await db.user.count() > 0) {
      return privateNoStoreJson({ error: 'La instancia ya está inicializada' }, { status: 409 });
    }
    await seedDatabase();
    return privateNoStoreJson({ success: true });
  } catch {
    return genericInternalErrorResponse('No se pudo inicializar la instancia');
  }
}
