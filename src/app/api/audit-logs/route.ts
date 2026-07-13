import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = await requireRole(request, ['admin', 'maestro']);
  if (auth instanceof NextResponse) return auth;

  try {
    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json(logs);
  } catch {
    // Fallback to ConfigAuditLog if AuditLog table doesn't exist
    try {
      const logs = await db.configAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return NextResponse.json(logs);
    } catch {
      return NextResponse.json([]);
    }
  }
}