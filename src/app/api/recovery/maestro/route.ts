import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy';
import { privateNoStoreJson } from '@/lib/private-api-response';

export const runtime = 'nodejs';

const FINGERPRINT_KEY = 'maestro_recovery_used_fingerprint';
const RESET_PREFIX = 'password_reset:';
const SESSION_PREFIX = 'session_generation:';

class RecoveryAlreadyUsedError extends Error {}

type StoredReset = {
  userId?: string
  usedAt?: string | null
}

function sameSecret(provided: string, expected: string): boolean {
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseStoredReset(value: string): StoredReset | null {
  try {
    return JSON.parse(value) as StoredReset
  } catch {
    return null
  }
}

function isSerializableConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2034')
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

    const body = await request.json().catch(() => ({})) as { password?: unknown };
    const password = typeof body.password === 'string' ? body.password : '';
    if (!isStrongEnoughPassword(password)) {
      return privateNoStoreJson(
        { error: `La contraseña temporal debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres` },
        { status: 400 },
      );
    }

    const secretFingerprint = createHash('sha256').update(expectedSecret).digest('hex');
    const passwordHash = await hashPassword(password);
    const now = new Date();

    const result = await db.$transaction(async (tx) => {
      const maestro = await tx.user.findFirst({ where: { role: 'maestro', active: true } });
      if (!maestro) return null;

      // Ensure a stable row exists, then claim its previous value with compare-and-set.
      // Concurrent requests cannot both replace the same previous value.
      await tx.appConfig.upsert({
        where: { key: FINGERPRINT_KEY },
        create: { key: FINGERPRINT_KEY, value: '__unused__' },
        update: {},
      });
      const previous = await tx.appConfig.findUnique({ where: { key: FINGERPRINT_KEY } });
      if (previous?.value === secretFingerprint) throw new RecoveryAlreadyUsedError();
      const claimed = await tx.appConfig.updateMany({
        where: { key: FINGERPRINT_KEY, value: previous?.value ?? '__unused__' },
        data: { value: secretFingerprint },
      });
      if (claimed.count !== 1) throw new RecoveryAlreadyUsedError();

      await tx.user.update({
        where: { id: maestro.id },
        data: { password: passwordHash, mustChangePassword: true },
      });

      // Break-glass supersedes every ordinary recovery link already issued to Maestro.
      const pendingResets = await tx.appConfig.findMany({
        where: { key: { startsWith: RESET_PREFIX } },
        select: { key: true, value: true },
      });
      for (const row of pendingResets) {
        const stored = parseStoredReset(row.value);
        if (!stored || stored.userId !== maestro.id || stored.usedAt) continue;
        const invalidated = { ...stored, usedAt: now.toISOString() };
        await tx.appConfig.updateMany({
          where: { key: row.key, value: row.value },
          data: { value: JSON.stringify(invalidated) },
        });
      }

      const sessionKey = `${SESSION_PREFIX}${maestro.id}`;
      const sessionRow = await tx.appConfig.findUnique({ where: { key: sessionKey } });
      const currentGeneration = Number(sessionRow?.value ?? '1');
      const normalizedGeneration = Number.isSafeInteger(currentGeneration) && currentGeneration >= 1 ? currentGeneration : 1;
      await tx.appConfig.upsert({
        where: { key: sessionKey },
        create: { key: sessionKey, value: String(normalizedGeneration + 1) },
        update: { value: String(normalizedGeneration + 1) },
      });

      // Audit only the event class and role. Never persist secret, fingerprint, password,
      // reset token or account email in the audit payload.
      await tx.auditLog.create({
        data: {
          action: 'maestro_password_recovered',
          entity: 'security',
          userRole: 'maestro',
          summary: 'Recuperación de emergencia utilizada; credenciales y sesiones anteriores revocadas',
          result: 'success',
          appVersion: process.env.APP_VERSION || null,
          engineVersion: process.env.CALCULATION_ENGINE_VERSION || null,
        },
      });

      return { email: maestro.email };
    }, { isolationLevel: 'Serializable' });

    if (!result) return privateNoStoreJson({ error: 'Titular no encontrado' }, { status: 404 });
    return privateNoStoreJson({ success: true, email: result.email, mustChangePassword: true });
  } catch (error) {
    if (error instanceof RecoveryAlreadyUsedError || isSerializableConflict(error)) {
      return privateNoStoreJson({ error: 'Esta recuperación ya fue utilizada' }, { status: 409 });
    }
    console.error('[POST /api/recovery/maestro] Error interno de recuperación');
    return privateNoStoreJson({ error: 'No se pudo completar la recuperación' }, { status: 500 });
  }
}
