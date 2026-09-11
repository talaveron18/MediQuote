import { NextRequest } from 'next/server';
import { hashPassword, logAudit } from '@/lib/auth';
import { completePasswordRecovery } from '@/lib/password-recovery-transaction';
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy';
import { privateNoStoreJson } from '@/lib/private-api-response';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { token?: unknown; password?: unknown };
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!token || !isStrongEnoughPassword(password)) {
      return privateNoStoreJson(
        { error: `Enlace inválido o contraseña inferior a ${MINIMUM_PASSWORD_LENGTH} caracteres` },
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
  } catch (error) {
    console.error('[POST /api/recovery/password/confirm] Error:', error);
    return privateNoStoreJson({ error: 'No se pudo completar la recuperación' }, { status: 500 });
  }
}
