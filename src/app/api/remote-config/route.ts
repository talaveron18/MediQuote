import { NextResponse } from 'next/server';
import {
  buildRemoteConfig, writeRemoteConfigFile, logConfigAudit,
  getRemoteConfigPath, REMOTE_CONFIG_PATH,
  readRemoteConfigFile, validateRemoteConfig, applyRemoteConfig,
  checkForNewConfig,
} from '@/lib/remote-config';
import { db } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/auth';

// ─── GET /api/remote-config?type=export|check|audit ─────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  // ── type=check: check if new remote config is available ──
  if (type === 'check') {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    try {
      const result = await checkForNewConfig();
      return NextResponse.json(result);
    } catch (error: any) {
      return NextResponse.json({ hasNewConfig: false, error: error.message }, { status: 500 });
    }
  }

  // ── type=audit: get audit log entries ──
  if (type === 'audit') {
    const auth = await requireRole(request, ['admin']);
    if (auth instanceof NextResponse) return auth;

    try {
      const logs = await db.configAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return NextResponse.json(logs);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // ── type=export: export config to file ──
  if (type === 'export') {
    const auth = await requireRole(request, ['admin']);
    if (auth instanceof NextResponse) return auth;

    try {
      const config = await buildRemoteConfig(auth.email);
      await writeRemoteConfigFile(config);

      await logConfigAudit({
        action: 'export',
        userEmail: auth.email,
        role: auth.role,
        newVersion: config._meta.version,
        fileSource: REMOTE_CONFIG_PATH,
        result: 'success',
      });

      return NextResponse.json({
        success: true,
        message: 'Configuración exportada correctamente.',
        path: getRemoteConfigPath(),
        version: config._meta.version,
        exportedAt: config._meta.exportedAt,
      });
    } catch (error: any) {
      try {
        await logConfigAudit({
          action: 'export',
          userEmail: auth.email,
          role: auth.role,
          result: 'error',
          errorMessage: error.message,
          fileSource: REMOTE_CONFIG_PATH,
        });
      } catch { /* audit logging failed, not critical */ }
      return NextResponse.json(
        { error: `Error al exportar: ${error.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: 'Tipo no válido. Usa: export, check, audit' }, { status: 400 });
}

// ─── POST /api/remote-config?type=import ────────────────────
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'import') {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    try {
      const body = await request.json();

      // Read file
      const { data, error: readError } = await readRemoteConfigFile();
      if (readError || !data) {
        await logConfigAudit({
          action: 'import',
          userEmail: auth.email,
          userName: auth.name,
          role: auth.role,
          result: 'error',
          errorMessage: readError || 'No se pudo leer el archivo.',
          fileSource: REMOTE_CONFIG_PATH,
        });
        return NextResponse.json({ error: readError || 'No se pudo leer el archivo.' }, { status: 400 });
      }

      // Get current version from DB for audit
      let oldVersion: string | undefined;
      try {
        const currentEngine = await db.appConfig.findUnique({ where: { key: 'calculationEngineVersion' } });
        oldVersion = currentEngine?.value || undefined;
      } catch { /* ignore */ }

      // Validate
      const validation = validateRemoteConfig(data);
      if (!validation.valid) {
        await logConfigAudit({
          action: 'import',
          userEmail: auth.email,
          userName: auth.name,
          role: auth.role,
          oldVersion,
          newVersion: validation.configVersion,
          result: 'error',
          errorMessage: validation.errors.join('; '),
          fileSource: REMOTE_CONFIG_PATH,
        });
        return NextResponse.json({
          error: 'Validación fallida.',
          errors: validation.errors,
          warnings: validation.warnings,
        }, { status: 422 });
      }

      // Apply
      const result = await applyRemoteConfig(data);

      if (result.success) {
        await logConfigAudit({
          action: 'import',
          userEmail: auth.email,
          userName: auth.name,
          role: auth.role,
          oldVersion,
          newVersion: data._meta?.version,
          changesApplied: result.changesApplied as any,
          fileSource: REMOTE_CONFIG_PATH,
          result: 'success',
        });
      } else {
        await logConfigAudit({
          action: 'import',
          userEmail: auth.email,
          userName: auth.name,
          role: auth.role,
          oldVersion,
          newVersion: data._meta?.version,
          changesApplied: result.changesApplied as any,
          fileSource: REMOTE_CONFIG_PATH,
          result: 'error',
          errorMessage: result.errors.join('; '),
        });
      }

      return NextResponse.json({
        success: result.success,
        changesApplied: result.changesApplied,
        errors: result.errors,
        warnings: validation.warnings,
        version: data._meta?.version,
      });
    } catch (error: any) {
      try {
        await logConfigAudit({
          action: 'import',
          userEmail: auth.email,
          userName: auth.name,
          role: auth.role,
          result: 'error',
          errorMessage: error.message,
          fileSource: REMOTE_CONFIG_PATH,
        });
      } catch { /* audit logging failed */ }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Tipo no válido. Usa: import' }, { status: 400 });
}