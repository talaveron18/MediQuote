import { NextRequest } from 'next/server';
import { hashPassword, logAudit } from '@/lib/auth';
import { completePasswordRecovery } from '@/lib/password-recovery-transaction';
import { isCanonicalPasswordRecoveryToken } from '@/lib/password-recovery';
import { isStrongEnoughPassword, MAXIMUM_PASSWORD_BYTES, MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy';
import { privateNoStoreJson } from '@/lib/private-api-response';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { token?: unknown; password?: unknown };
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    // Validate the opaque token before doing bcrypt work or touching recovery storage.
    if (!isCanonicalPasswordRecoveryToken(token) || !isStrongEnoughPassword(password)) {
      return privateNoStoreJson(
        { error: `Enlace inválido o contraseña fuera de la política (${MINIMUM_PASSWORD_LENGTH} caracteres mínimo, ${MAXIMUM_PASSWORD_BYTES} bytes máximo)` },
        { status: 400 },
      );
    }

    // Hashing is intentionally done before entering the DB transaction. The
    // token remains unused if bcrypt itself fails.
    const passwordHash = await hashPassword(password);
    const completed = await completePasswordRecovery(token, passwordHash);
    if (!completed) {
      await logAudit({
        action: 'password_reset_token_invalid',
        entity: 'user',
        summary: 'Intento de recuperación con enlace inválido, caducado o ya utilizado',
        result: 'blocked',
      });
      return privateNoStoreJson({ error: 'El enlace no es válido o ha caducado' }, { status: 400 });
    }

    await logAudit({
      action: 'password_reset_completed',
      entity: 'user',
      entityId: completed.id,
      userId: completed.id,
      userName: completed.name,
      userRole: completed.role,
      summary: `Recuperación de contraseña completada para ${completed.email}; sesiones anteriores revocadas`,
    });

    return privateNoStoreJson({ success: true });
  } catch {
    // Never include thrown DB/hash details in recovery logs: they can contain
    // implementation data and are not required to diagnose the public flow.
    console.error('[POST /api/recovery/password/confirm] Internal recovery error');
    return privateNoStoreJson({ error: 'No se pudo completar la recuperación' }, { status: 500 });
  }
}
