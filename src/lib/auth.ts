import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifySessionToken } from '@/lib/session';
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
  // Netlify Database/PostgreSQL se protege en la plataforma. La copia SQLite
  // previa a escritura solo corresponde al modo local heredado.
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

/**
 * Reads session cookie and returns user from DB or null.
 */
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

/**
 * Returns 401 if not logged in.
 */
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

/**
 * Returns 403 if user role not in allowedRoles.
 * maestro always has access.
 */
export async function requireRole(
  request: Request,
  allowedRoles: string[]
): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (user.mustChangePassword) return passwordChangeRequired();
  // maestro has access to everything
  if (user.role !== 'maestro' && !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }
  const backupError = await protectMutation(request);
  if (backupError) return backupError;
  return user;
}

/**
 * Returns 403 if user is not maestro.
 */
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

/**
 * Hash a password with bcrypt.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

/**
 * Verify a password against a bcrypt hash.
 * Solo se aceptan hashes bcrypt; cualquier valor almacenado que no
 * empiece por $2 se rechaza (no se admiten contraseñas en texto plano).
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored.startsWith('$2')) {
    return false;
  }
  return bcrypt.compare(plain, stored);
}

// ─── Internal field sanitization ──────────────────────────────────

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

/**
 * Strip internal financial fields from data for non-admin/non-maestro roles.
 * maestro and admin see everything. comercial/gestor/readonly get stripped.
 */
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

// ─── Audit Log Helper ──────────────────────────────────────────

export async function logAudit(params: {
  action: string;
  entity?: string;
  entityId?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  summary?: string;
  oldData?: string;
  newData?: string;
  result?: string;
  errorMessage?: string;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity ?? null,
        entityId: params.entityId ?? null,
        userId: params.userId ?? null,
        userName: params.userName ?? null,
        userRole: params.userRole ?? null,
        summary: params.summary ?? null,
        oldData: params.oldData ?? null,
        newData: params.newData ?? null,
        result: params.result ?? 'success',
        errorMessage: params.errorMessage ?? null,
        appVersion: process.env.APP_VERSION || null,
        engineVersion: process.env.CALCULATION_ENGINE_VERSION || null,
      },
    })
  } catch {
    // Audit should never break the main flow
  }
}

