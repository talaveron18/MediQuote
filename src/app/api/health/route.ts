import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const userCount = await db.user.count();
    const maestroExists = await db.user.findFirst({
      where: { role: 'maestro', active: true },
      select: { id: true },
    });

    // Try legal records count — table may not exist in older schemas
    let legalRecordsCount = 0;
    try {
      legalRecordsCount = await db.legalRecord.count();
    } catch {
      // Table doesn't exist yet — not an error for health check
    }

    // Try legal parameters count — table may not exist in older schemas
    let legalParametersCount = 0;
    try {
      legalParametersCount = await db.legalParameter.count();
    } catch {
      // Table doesn't exist yet — not an error for health check
    }

    return NextResponse.json({
      ok: true,
      app: 'MediQuote Pro',
      instance: 'GASI',
      db: 'ok',
      userCount,
      maestroExists: !!maestroExists,
      legalRecordsCount,
      legalParametersCount,
      timestamp,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        app: 'MediQuote Pro',
        instance: 'GASI',
        db: 'error',
        error: 'Base de datos no inicializada',
        detail: message,
        timestamp,
      },
      { status: 500 },
    );
  }
}