import { NextResponse } from 'next/server';
import {
  buildRemoteConfig, writeRemoteConfigFile, logConfigAudit,
  getRemoteConfigPath, REMOTE_CONFIG_PATH,
  readRemoteConfigFile, validateRemoteConfig, applyRemoteConfig,
  checkForNewConfig,
} from '@/lib/remote-config';
import { db } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/auth';
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response';

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
      return privateNoStoreJson(result);
    } catch (error) {
      console.error('[GET /api/remote-config?type=check] Error:', error);
      return genericInternalErrorResponse('No se pudo comprobar la configuración remota');
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
      return privateNoStoreJson(logs);
    } catch (error) {
      console.error('[GET /api/remote-config?type=audit] Error:', error);
      return genericInternalErrorResponse('No se pudo obtener la auditoría de configuración');
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

      return privateNoStoreJson({
        success: true,
        message: 'Configuración exportada correctamente.',
        path: getRemoteConfigPath(),
        version: config._meta.version,
        exportedAt: config._meta.exportedAt,
      });
    } catch (error) {
      console.error('[GET /api/remote-config?type=export] Error:', error);
      try {
        await logConfigAudit({
          action: 'export',
          userEmail: auth.email,
          role: auth.role,
          result: 'error',
          errorMessage: error instanceof Error ? error.message : 'Error no identificado',
          fileSource: REMOTE_CONFIG_PATH,
        });
      } catch { /* audit logging failed, not critical */ }
      return genericInternalErrorResponse('No se pudo exportar la configuración');
    }
  }

  return privateNoStoreJson({ error: 'Tipo no válido. Usa: export, check, audit' }, { status: 400 });
}

// ─── POST /api/remote-config?type=import ────────────────────
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'import') {
    // Importar configuración puede alterar parámetros que afectan al cálculo.
    // Debe tener la misma barrera administrativa que exportar y auditar.
    const auth = await requireRole(request, ['admin']);
    if (auth instanceof NextResponse) return auth;

    try {
      // El cuerpo de la petición no es fuente de identidad ni de configuración.
      // La identidad procede de la sesión y la configuración se lee del fichero controlado.
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
        return privateNoStoreJson({ error: 'No se pudo leer la configuración remota.' }, { status: 400 });
      }

      let oldVersion: string | undefined;
      try {
        const currentEngine = await db.appConfig.findUnique({ where: { key: 'calculationEngineVersion' } });
        oldVersion = currentEngine?.value || undefined;
      } catch { /* ignore */ }

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
        return privateNoStoreJson({
          error: 'Validación fallida.',
          errors: validation.errors,
          warnings: validation.warnings,
        }, { status: 422 });
      }

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

      return privateNoStoreJson({
        success: result.success,
        changesApplied: result.changesApplied,
        errors: result.errors,
        warnings: validation.warnings,
        version: data._meta?.version,
      });
    } catch (error) {
      console.error('[POST /api/remote-config?type=import] Error:', error);
      try {
        await logConfigAudit({
          action: 'import',
          userEmail: auth.email,
          userName: auth.name,
          role: auth.role,
          result: 'error',
          errorMessage: error instanceof Error ? error.message : 'Error no identificado',
          fileSource: REMOTE_CONFIG_PATH,
        });
      } catch { /* audit logging failed */ }
      return genericInternalErrorResponse('No se pudo importar la configuración');
    }
  }

  return privateNoStoreJson({ error: 'Tipo no válido. Usa: import' }, { status: 400 });
}
