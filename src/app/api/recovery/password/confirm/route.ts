import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, logAudit } from '@/lib/auth';
import {
  bumpSessionGeneration,
  consumeStoredPasswordRecovery,
} from '@/lib/password-recovery-store';
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { token?: string; password?: string };
    const token = body.token?.trim() ?? '';
    const password = body.password ?? '';

    if (!token || !isStrongEnoughPassword(password)) {
      return NextResponse.json(
        { error: `Enlace inválido o contraseña inferior a ${MINIMUM_PASSWORD_LENGTH} caracteres` },
        { status: 400 },
      );
    }

    const userId = await consumeStoredPasswordRecovery(token);
    if (!userId) {
      return NextResponse.json({ error: 'El enlace no es válido o ha caducado' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    if (!user?.active) {
      return NextResponse.json({ error: 'El enlace no es válido o ha caducado' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await db.user.update({
      where: { id: user.id },
      data: { password: passwordHash, mustChangePassword: false },
    });
    await bumpSessionGeneration(user.id);

    await logAudit({
      action: 'password_recovery_completed',
      entity: 'user',
      entityId: user.id,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      summary: `Recuperación de contraseña completada para ${user.email}; sesiones anteriores revocadas`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/recovery/password/confirm] Error:', error);
    return NextResponse.json({ error: 'No se pudo completar la recuperación' }, { status: 500 });
  }
}
