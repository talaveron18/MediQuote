import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, hashPassword, SESSION_COOKIE, getCurrentUser, logAudit } from '@/lib/auth';
import { createSessionToken } from '@/lib/session';
import { bumpSessionGeneration, getSessionGeneration } from '@/lib/password-recovery-store';
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy';
import { ensureDailyAutomaticBackup } from '@/lib/sqlite-backup';

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'change-password') {
    const auth = await getCurrentUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    try {
      const body = await request.json();
      const { currentPassword, newPassword } = body;

      if (!currentPassword || !newPassword) {
        return NextResponse.json({ error: 'Se requieren ambos campos' }, { status: 400 });
      }

      if (!isStrongEnoughPassword(newPassword)) {
        return NextResponse.json(
          { error: `La nueva contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres` },
          { status: 400 },
        );
      }

      const user = await db.user.findUnique({ where: { id: auth.id } });
      if (!user) {
        return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
      }

      const valid = await verifyPassword(currentPassword, user.password);
      if (!valid) {
        await logAudit({
          action: 'password_change_failed', entity: 'user', entityId: auth.id,
          userId: auth.id, userName: auth.name, userRole: auth.role,
          summary: 'Cambio de contraseña fallido: contraseña actual incorrecta', result: 'error',
        });
        return NextResponse.json({ error: 'Contraseña actual incorrecta' }, { status: 401 });
      }

      const hashed = await hashPassword(newPassword);
      await ensureDailyAutomaticBackup();
      await db.user.update({
        where: { id: auth.id },
        data: { password: hashed, mustChangePassword: false },
      });
      const newGeneration = await bumpSessionGeneration(auth.id);

      await logAudit({
        action: 'password_changed', entity: 'user', entityId: auth.id,
        userId: auth.id, userName: auth.name, userRole: auth.role,
        summary: 'Contraseña cambiada correctamente; sesiones anteriores revocadas',
      });

      const response = NextResponse.json({ success: true });
      response.cookies.set(SESSION_COOKIE, createSessionToken(auth.id, newGeneration), {
        path: '/', sameSite: 'lax', httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
      });
      return response;
    } catch {
      return NextResponse.json({ error: 'Error al cambiar contraseña' }, { status: 500 });
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
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  }

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user;
    try {
      user = await db.user.findUnique({ where: { email: normalizedEmail } });
    } catch (dbError: unknown) {
      const detail = dbError instanceof Error ? dbError.message : String(dbError);
      return NextResponse.json(
        { error: 'Error de base de datos o base de datos no inicializada', detail },
        { status: 500 },
      );
    }

    if (!user || !user.active) {
      return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    const passwordValid = await verifyPassword(password, user.password);
    if (!passwordValid) {
      await logAudit({
        action: 'login_failed', entity: 'user', entityId: user?.id,
        userId: user?.id, userName: user?.name || normalizedEmail,
        userRole: user?.role || 'unknown', summary: `Intento de login fallido: ${normalizedEmail}`,
        result: 'error',
      }).catch(() => {});
      return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    await ensureDailyAutomaticBackup();
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    await logAudit({
      action: 'login', entity: 'user', entityId: user.id,
      userId: user.id, userName: user.name, userRole: user.role,
      summary: `Login: ${user.email} (${user.role})`,
    }).catch(() => {});

    const generation = await getSessionGeneration(user.id);
    const response = NextResponse.json({
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
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Error de base de datos o base de datos no inicializada', detail },
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
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        id: user.id, email: user.email, name: user.name,
        role: user.role, mustChangePassword: user.mustChangePassword,
      },
    });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
