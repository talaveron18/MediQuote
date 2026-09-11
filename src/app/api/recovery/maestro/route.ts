import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, logAudit } from '@/lib/auth';
import { bumpSessionGeneration } from '@/lib/password-recovery-store';
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy';
import { privateNoStoreJson } from '@/lib/private-api-response';

export const runtime = 'nodejs';

function sameSecret(provided: string, expected: string): boolean {
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  try {
    // Break-glass must use a dedicated secret. Never reuse bootstrap credentials:
    // compromise or operational exposure of bootstrap must not unlock recovery.
    const expectedSecret = process.env.GASI_MAESTRO_RECOVERY_SECRET?.trim() || '';
    const providedSecret = request.headers.get('x-gasi-recovery-key')?.trim() ?? '';
    if (expectedSecret.length < 32 || !sameSecret(providedSecret, expectedSecret)) {
      return privateNoStoreJson({ error: 'Recuperación no disponible' }, { status: 404 });
    }

    const secretFingerprint = createHash('sha256').update(expectedSecret).digest('hex');
    const previous = await db.appConfig.findUnique({ where: { key: 'maestro_recovery_used_fingerprint' } });
    if (previous?.value === secretFingerprint) {
      return privateNoStoreJson({ error: 'Esta recuperación ya fue utilizada' }, { status: 409 });
    }

    const body = await request.json().catch(() => ({})) as { password?: unknown };
    const password = typeof body.password === 'string' ? body.password : '';
    if (!isStrongEnoughPassword(password)) {
      return privateNoStoreJson(
        { error: `La contraseña temporal debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres` },
        { status: 400 },
      );
    }

    const maestro = await db.user.findFirst({ where: { role: 'maestro', active: true } });
    if (!maestro) return privateNoStoreJson({ error: 'Titular no encontrado' }, { status: 404 });

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
    await bumpSessionGeneration(maestro.id);

    await logAudit({
      action: 'maestro_password_recovered', entity: 'user', entityId: maestro.id,
      userId: maestro.id, userName: maestro.name, userRole: 'maestro',
      summary: `Recuperación de emergencia utilizada para ${maestro.email}; sesiones anteriores revocadas`,
    });

    return privateNoStoreJson({ success: true, email: maestro.email, mustChangePassword: true });
  } catch (error) {
    console.error('[POST /api/recovery/maestro] Error:', error);
    return privateNoStoreJson({ error: 'No se pudo completar la recuperación' }, { status: 500 });
  }
}
