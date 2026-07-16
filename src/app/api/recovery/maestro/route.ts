import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, logAudit } from '@/lib/auth';
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy';

export const runtime = 'nodejs';

function sameSecret(provided: string, expected: string): boolean {
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.GASI_MAESTRO_RECOVERY_SECRET?.trim() ?? '';
    const providedSecret = request.headers.get('x-gasi-recovery-key')?.trim() ?? '';
    if (expectedSecret.length < 32 || !sameSecret(providedSecret, expectedSecret)) {
      return NextResponse.json({ error: 'Recuperación no disponible' }, { status: 404 });
    }

    const secretFingerprint = createHash('sha256').update(expectedSecret).digest('hex');
    const previous = await db.appConfig.findUnique({ where: { key: 'maestro_recovery_used_fingerprint' } });
    if (previous?.value === secretFingerprint) {
      return NextResponse.json({ error: 'Esta recuperación ya fue utilizada' }, { status: 409 });
    }

    const body = await request.json() as { password?: string };
    const password = body.password ?? '';
    if (!isStrongEnoughPassword(password)) {
      return NextResponse.json(
        { error: `La contraseña temporal debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres` },
        { status: 400 },
      );
    }

    const maestro = await db.user.findFirst({ where: { role: 'maestro', active: true } });
    if (!maestro) return NextResponse.json({ error: 'Titular no encontrado' }, { status: 404 });

    await db.$transaction([
      db.user.update({
        where: { id: maestro.id },
        data: { password: await hashPassword(password), mustChangePassword: true },
      }),
      db.appConfig.upsert({
        where: { key: 'maestro_recovery_used_fingerprint' },
        create: { key: 'maestro_recovery_used_fingerprint', value: secretFingerprint },
        update: { value: secretFingerprint },
      }),
    ]);

    await logAudit({
      action: 'maestro_password_recovered', entity: 'user', entityId: maestro.id,
      userId: maestro.id, userName: maestro.name, userRole: 'maestro',
      summary: `Recuperación de emergencia utilizada para ${maestro.email}`,
    });

    return NextResponse.json({ success: true, email: maestro.email, mustChangePassword: true });
  } catch (error) {
    console.error('[POST /api/recovery/maestro] Error:', error);
    return NextResponse.json({ error: 'No se pudo completar la recuperación' }, { status: 500 });
  }
}
