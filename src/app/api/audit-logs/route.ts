import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response';

export async function GET(request: Request) {
  const auth = await requireRole(request, ['admin', 'maestro']);
  if (auth instanceof NextResponse) return auth;

  if (new URL(request.url).searchParams.size > 0) {
    return privateNoStoreJson({ error: 'Parámetros de consulta no admitidos' }, { status: 400 });
  }

  try {
    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return privateNoStoreJson(logs);
  } catch {
    // Compatibility fallback for older schemas. If both stores fail we must
    // fail closed: returning [] would falsely assert that the audit trail is empty.
    try {
      const logs = await db.configAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return privateNoStoreJson(logs);
    } catch {
      return genericInternalErrorResponse('Error al obtener el registro de auditoría');
    }
  }
}
