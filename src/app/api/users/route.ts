import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, hashPassword, logAudit } from '@/lib/auth';
import { generateTemporaryPassword } from '@/lib/password';
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from '@/lib/password-policy';
import { privateNoStoreJson } from '@/lib/private-api-response';

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── GET — List users ────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['maestro', 'admin']);
    if (auth instanceof NextResponse) return auth;

    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        createdById: true,
        createdByUser: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('[GET /api/users] Error:', error);
    return NextResponse.json({ error: 'Error al obtener usuarios' }, { status: 500 });
  }
}

// ─── POST — Create user ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['maestro', 'admin']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { email, password, name, role } = body;

    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: 'Faltan campos obligatorios: email, password, name, role' }, { status: 400 });
    }
    if (!isStrongEnoughPassword(password)) {
      return NextResponse.json(
        { error: `La contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres` },
        { status: 400 },
      );
    }

    if (role === 'maestro' && auth.role !== 'maestro') {
      return NextResponse.json({ error: 'Solo el titular puede crear usuarios maestro' }, { status: 403 });
    }
    if (role === 'admin' && auth.role !== 'maestro') {
      return NextResponse.json({ error: 'Solo el titular puede crear administradores' }, { status: 403 });
    }

    const existing = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 });
    }

    const hashed = await hashPassword(password);
    const user = await db.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashed,
        name,
        role,
        mustChangePassword: true,
        createdById: auth.id,
      },
      select: {
        id: true, email: true, name: true, role: true,
        active: true, mustChangePassword: true, createdAt: true,
      },
    });

    await logAudit({
      action: 'user_created',
      entity: 'user',
      entityId: user.id,
      userId: auth.id,
      userName: auth.name,
      userRole: auth.role,
      summary: `Usuario creado: ${user.email} (${role})`,
      newData: JSON.stringify({ email: user.email, name, role }),
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/users] Error:', error);
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 });
  }
}

// ─── PUT — Update user ──────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['maestro', 'admin']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { id, name, email, role, active, password, mustChangePassword } = body;

    if (!id) {
      return NextResponse.json({ error: 'Se requiere ID' }, { status: 400 });
    }

    const target = await db.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    if (target.role === 'maestro' && auth.role !== 'maestro') {
      return NextResponse.json({ error: 'No se puede modificar el usuario titular' }, { status: 403 });
    }

    if (role && role !== target.role) {
      if (role === 'maestro' && auth.role !== 'maestro') {
        return NextResponse.json({ error: 'Solo el titular puede asignar el rol maestro' }, { status: 403 });
      }
      if (target.role === 'maestro') {
        return NextResponse.json({ error: 'No se puede cambiar el rol del titular' }, { status: 403 });
      }
      if (role === 'admin' && auth.role !== 'maestro') {
        return NextResponse.json({ error: 'Solo el titular puede crear administradores' }, { status: 403 });
      }
    }

    if (active === false && target.role === 'maestro') {
      return NextResponse.json({ error: 'No se puede desactivar al usuario titular' }, { status: 403 });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email.toLowerCase().trim();
    if (role !== undefined) updateData.role = role;
    if (active !== undefined) updateData.active = active;
    if (mustChangePassword !== undefined) updateData.mustChangePassword = mustChangePassword;
    if (password) {
      if (!isStrongEnoughPassword(password)) {
        return NextResponse.json(
          { error: `La contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres` },
          { status: 400 },
        );
      }
      updateData.password = await hashPassword(password);
      updateData.mustChangePassword = true;
    }

    const oldData = JSON.stringify({ name: target.name, email: target.email, role: target.role, active: target.active });

    const updated = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true, email: true, name: true, role: true,
        active: true, mustChangePassword: true, lastLoginAt: true, createdAt: true,
      },
    });

    const newData = JSON.stringify({ name: updated.name, email: updated.email, role: updated.role, active: updated.active });

    await logAudit({
      action: 'user_updated',
      entity: 'user',
      entityId: id,
      userId: auth.id,
      userName: auth.name,
      userRole: auth.role,
      summary: `Usuario actualizado: ${target.email} -> ${updated.email || target.email}`,
      oldData,
      newData,
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error('[PUT /api/users] Error:', error);
    return NextResponse.json({ error: 'Error al actualizar usuario' }, { status: 500 });
  }
}

// ─── PATCH — Reset password / Toggle active ─────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['maestro', 'admin']);
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return privateNoStoreJson({ error: 'El cuerpo de la solicitud debe ser un objeto JSON válido' }, { status: 400 });
    }
    if (!isJsonObject(body)) {
      return privateNoStoreJson({ error: 'El cuerpo de la solicitud debe ser un objeto JSON válido' }, { status: 400 });
    }
    const { id, action } = body;

    if (typeof id !== 'string' || id.trim().length === 0) {
      return privateNoStoreJson({ error: 'Se requiere ID' }, { status: 400 });
    }
    if (action !== 'toggleActive' && action !== 'resetPassword') {
      return privateNoStoreJson({ error: 'Acción de administración de usuario no válida' }, { status: 400 });
    }

    const target = await db.user.findUnique({ where: { id: id.trim() } });
    if (!target) {
      return privateNoStoreJson({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // ── Toggle active ────────────────────────────────────────────
    if (action === 'toggleActive') {
      if (target.role === 'maestro' && auth.role !== 'maestro') {
        return privateNoStoreJson({ error: 'No se puede desactivar al titular' }, { status: 403 });
      }

      const newActive = !target.active;
      await db.user.update({
        where: { id: target.id },
        data: { active: newActive },
      });

      await logAudit({
        action: newActive ? 'user_activated' : 'user_deactivated',
        entity: 'user',
        entityId: target.id,
        userId: auth.id,
        userName: auth.name,
        userRole: auth.role,
        summary: `Usuario ${newActive ? 'activado' : 'desactivado'}: ${target.email}`,
        oldData: JSON.stringify({ active: target.active }),
        newData: JSON.stringify({ active: newActive }),
      });

      return privateNoStoreJson({ success: true, active: newActive });
    }

    // ── Reset password ───────────────────────────────────────────
    if (target.role === 'maestro' && auth.role !== 'maestro') {
      return privateNoStoreJson({ error: 'No se puede resetear la contraseña del titular' }, { status: 403 });
    }

    const tempPassword = generateTemporaryPassword();
    const hashed = await hashPassword(tempPassword);

    await db.user.update({
      where: { id: target.id },
      data: { password: hashed, mustChangePassword: true },
    });

    await logAudit({
      action: 'password_reset',
      entity: 'user',
      entityId: target.id,
      userId: auth.id,
      userName: auth.name,
      userRole: auth.role,
      summary: `Contraseña reseteada para: ${target.email}`,
    });

    return privateNoStoreJson({
      success: true,
      temporaryPassword: tempPassword,
      message: `Contraseña temporal para ${target.email}. mustChangePassword activado.`,
    });
  } catch (error) {
    console.error('[PATCH /api/users] Error:', error);
    return privateNoStoreJson({ error: 'Error' }, { status: 500 });
  }
}
