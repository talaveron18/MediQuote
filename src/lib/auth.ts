import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifySessionToken } from '@/lib/session';
import { getSessionGeneration } from '@/lib/password-recovery-store';
import { ensureDailyAutomaticBackup } from '@/lib/sqlite-backup';

export const SESSION_COOKIE = 'gasi_session';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
};

function passwordChangeRequired(): NextResponse {
  return NextResponse.json(
    { error: 'Debes cambiar la contraseña antes de continuar', code: 'PASSWORD_CHANGE_REQUIRED' },
    { status: 403 },
  );
}

async function protectMutation(request: Request): Promise<NextResponse | null> {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return null;
  if (new URL(request.url).pathname === '/api/backup') return null;
  if (process.env.NETLIFY || !process.env.DATABASE_URL?.startsWith('file:')) return null;
  try {
    await ensureDailyAutomaticBackup();
    return null;
  } catch (error) {
    return NextResponse.json({
      error: 'Operación detenida: no se pudo crear la copia de seguridad automática',
      detail: error instanceof Error ? error.message : undefined,
    }, { status: 503 });
  }
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));

  if (!match) return null;

  const token = decodeURIComponent(match.slice(`${SESSION_COOKIE}=`.length));
  const session = verifySessionToken(token);
  if (!session) return null;

  const currentGeneration = await getSessionGeneration(session.userId);
  if (session.generation !== currentGeneration) return null;

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function requireAuth(
  request: Request
): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (user.mustChangePassword) return passwordChangeRequired();
  const backupError = await protectMutation(request);
  if (backupError) return backupError;
  return user;
}

export async function requireRole(
  request: Request,
  allowedRoles: string[]
): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (user.mustChangePassword) return passwordChangeRequired();
  if (user.role !== 'maestro' && !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }
  const backupError = await protectMutation(request);
  if (backupError) return backupError;
  return user;
}

export async function requireMaestro(
  request: Request
): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (user.mustChangePassword) return passwordChangeRequired();
  if (user.role !== 'maestro') {
    return NextResponse.json({ error: 'Acceso denegado. Solo el titular puede acceder.' }, { status: 403 });
  }
  const backupError = await protectMutation(request);
  if (backupError) return backupError;
  return user;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$2')) {
    return bcrypt.compare(plain, stored);
  }
  if (plain === stored) {
    try {
      const hash = await hashPassword(plain);
      await db.user.updateMany({ where: { password: stored }, data: { password: hash } });
    } catch {
    }
    return true;
  }
  return false;
}

const INTERNAL_FIELDS = [
  'internalCostPerHour',
  'internalMargin',
  'margin',
  'profit',
  'commission',
  'costeInterno',
  'precioMaximo',
  'precioRecomendado',
  'precioCatalogo',
  'precioTrabajo',
  'defaultInternalCost',
  'internalCost',
  'internalCostTotal',
  'totalInternalCost',
  'costSnapshot',
  'snapshot',
  'salary',
  'employerContributions',
  'occupationalRisk',
  'netBeforeCommission',
  'commissionAmount',
  'commissionRatePercent',
  'finalGasiBenefit',
  'gasiReturnOnCostPercent',
  'finalMarginOnSalePercent',
  'password',
  'mustChangePassword',
  'lastLoginAt',
  'createdById',
]

export function sanitizeForRole<T>(data: T, role: string): T {
  if (role === 'maestro' || role === 'admin') return data
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForRole(item, role)) as T
  }
  if (data && typeof data === 'object') {
    const clean = { ...data }
    for (const key of INTERNAL_FIELDS) {
      delete (clean as any)[key]
    }
    for (const key of Object.keys(clean)) {
      if ((clean as any)[key] && typeof (clean as any)[key] === 'object') {
        (clean as any)[key] = sanitizeForRole((clean as any)[key], role)
      }
    }
    return clean as T
  }
  return data
}

export async function logAudit(params: {
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  summary?: string;
  oldData?: string;
  newData?: string;
  result?: string;
}) {
  try {
    await db.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        userId: params.userId,
        userName: params.userName,
        userRole: params.userRole,
        summary: params.summary,
        oldData: params.oldData,
        newData: params.newData,
        result: params.result || 'success',
      },
    });
  } catch (error) {
    console.error('[audit] No se pudo registrar:', error);
  }
}
