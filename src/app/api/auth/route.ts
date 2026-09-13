import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, hashPassword, SESSION_COOKIE, getCurrentUser, logAudit } from '@/lib/auth';
import { createSessionToken } from '@/lib/session';
import { getSessionGeneration } from '@/lib/password-recovery-store';
import { changePasswordAndRevokeRecovery } from '@/lib/password-recovery-transaction';
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy';
import { ensureDailyAutomaticBackup } from '@/lib/sqlite-backup';
import { privateNoStoreJson } from '@/lib/private-api-response';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readObjectBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'change-password') {
    const auth = await getCurrentUser(request);
    if (!auth) {
      return privateNoStoreJson({ error: 'No autenticado' }, { status: 401 });
    }

    try {
      const body = await readObjectBody(request);
      if (!body) {
        return privateNoStoreJson({ error: 'Solicitud no válida' }, { status: 400 });
      }
      const { currentPassword, newPassword } = body;

      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
        return privateNoStoreJson({ error: 'Se requieren ambos campos' }, { status: 400 });
      }

      if (!isStrongEnoughPassword(newPassword)) {
        return privateNoStoreJson(
          { error: `La nueva contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres` },
          { status: 400 },
        );
      }

      const user = await db.user.findUnique({ where: { id: auth.id } });
      if (!user) {
        return privateNoStoreJson({ error: 'Usuario no encontrado' }, { status: 404 });
      }

      const valid = await verifyPassword(currentPassword, user.password);
      if (!valid) {
        await logAudit({
          action: 'password_change_failed', entity: 'user', entityId: auth.id,
          userId: auth.id, userName: auth.name, userRole: auth.role,
          summary: 'Cambio de contraseña fallido: contraseña actual incorrecta', result: 'error',
        });
        return privateNoStoreJson({ error: 'Contraseña actual incorrecta' }, { status: 401 });
      }

      const hashed = await hashPassword(newPassword);
      await ensureDailyAutomaticBackup();
      const newGeneration = await changePasswordAndRevokeRecovery(auth.id, hashed);

      await logAudit({
        action: 'password_changed', entity: 'user', entityId: auth.id,
        userId: auth.id, userName: auth.name, userRole: auth.role,
        summary: 'Contraseña cambiada correctamente; sesiones y enlaces de recuperación anteriores revocados',
      });

      const response = privateNoStoreJson({ success: true });
      response.cookies.set(SESSION_COOKIE, createSessionToken(auth.id, newGeneration), {
        path: '/', sameSite: 'lax', httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
      });
      return response;
    } catch (error) {
      console.error('[POST /api/auth?action=change-password] Error:', error);
      return privateNoStoreJson({ error: 'Error al cambiar contraseña' }, { status: 500 });
    }
  }

  if (action === 'logout') {
    const auth = await getCurrentUser(request);
    if (auth) {
      await logAudit({
        action: 'logout', entity: 'user', entityId: auth.id,
        userId: auth.id, userName: auth.name, userRole: auth.role,
        summary: `Logout: ${auth.email}`,
      }).catch(() => {});
    }
    const response = privateNoStoreJson({ success: true });
    response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  }

  try {
    const body = await readObjectBody(request);
    if (!body) {
      return privateNoStoreJson({ error: 'Credenciales incorrectas' }, { status: 401 });
    }
    const { email, password } = body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return privateNoStoreJson({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user;
    try {
      user = await db.user.findUnique({ where: { email: normalizedEmail } });
    } catch (dbError) {
      console.error('[POST /api/auth] Error consultando usuario:', dbError);
      return privateNoStoreJson(
        { error: 'No se pudo completar la autenticación' },
        { status: 500 },
      );
    }

    if (!user || !user.active) {
      return privateNoStoreJson({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    const passwordValid = await verifyPassword(password, user.password);
    if (!passwordValid) {
      await logAudit({
        action: 'login_failed', entity: 'user', entityId: user.id,
        userId: user.id, userName: user.name,
        userRole: user.role, summary: `Intento de login fallido: ${normalizedEmail}`,
        result: 'error',
      }).catch(() => {});
      return privateNoStoreJson({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    await ensureDailyAutomaticBackup();
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    await logAudit({
      action: 'login', entity: 'user', entityId: user.id,
      userId: user.id, userName: user.name, userRole: user.role,
      summary: `Login: ${user.email} (${user.role})`,
    }).catch(() => {});

    const generation = await getSessionGeneration(user.id);
    const response = privateNoStoreJson({
      success: true,
      user: {
        id: user.id, email: user.email, name: user.name,
        role: user.role, mustChangePassword: user.mustChangePassword,
      },
    });

    response.cookies.set(SESSION_COOKIE, createSessionToken(user.id, generation), {
      path: '/', sameSite: 'lax', httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (error) {
    console.error('[POST /api/auth] Error:', error);
    return privateNoStoreJson(
      { error: 'No se pudo completar la autenticación' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'me') {
    const user = await getCurrentUser(request);
    if (!user) {
      return privateNoStoreJson({ error: 'No autenticado' }, { status: 401 });
    }
    return privateNoStoreJson({
      user: {
        id: user.id, email: user.email, name: user.name,
        role: user.role, mustChangePassword: user.mustChangePassword,
      },
    });
  }

  return privateNoStoreJson({ error: 'Acción no válida' }, { status: 400 });
}
