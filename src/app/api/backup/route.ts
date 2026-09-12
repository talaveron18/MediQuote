import { NextRequest, NextResponse } from 'next/server';
import { requireRole, logAudit } from '@/lib/auth';
import { createSqliteBackup, listBackups, readBackup, restoreSqliteBackup } from '@/lib/sqlite-backup';
import { exportCentralDatabase, importCentralDatabase } from '@/lib/postgres-backup';
import { genericInternalErrorResponse, privateNoStoreJson, privateNoStoreResponse } from '@/lib/private-api-response';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'maestro']);
  if (auth instanceof NextResponse) return auth;
  try {
    const type = request.nextUrl.searchParams.get('type') || 'list';
    if (!process.env.DATABASE_URL?.startsWith('file:')) {
      if (type === 'list') return privateNoStoreJson({ backups: [], central: true });
      if (type === 'download' || type === 'export') {
        const backup = await exportCentralDatabase();
        const filename = `gasi-central-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        return privateNoStoreResponse(JSON.stringify(backup), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${filename}"` } });
      }
    }
    if (type === 'list') return privateNoStoreJson({ backups: await listBackups() });
    if (type === 'download') {
      const filename = request.nextUrl.searchParams.get('filename') || '';
      const bytes = await readBackup(filename);
      return privateNoStoreResponse(Uint8Array.from(bytes).buffer, { headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': `attachment; filename="${filename}"`,
      } });
    }
    return privateNoStoreJson({ error: 'Tipo no válido' }, { status: 400 });
  } catch {
    return genericInternalErrorResponse('Error al obtener la copia de seguridad');
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'maestro']);
  if (auth instanceof NextResponse) return auth;
  try {
    const type = request.nextUrl.searchParams.get('type');
    if (!process.env.DATABASE_URL?.startsWith('file:')) {
      if (type === 'now') {
        const backup = await exportCentralDatabase();
        return privateNoStoreJson({ success: true, central: true, filename: `gasi-central-${backup.createdAt.slice(0, 10)}.json`, downloadUrl: '/api/backup?type=export' });
      }
      if (type === 'import') {
        const form = await request.formData(); const file = form.get('database');
        if (!(file instanceof File)) return privateNoStoreJson({ error: 'Falta el archivo de copia' }, { status: 400 });
        if (file.size > 100 * 1024 * 1024) return privateNoStoreJson({ error: 'El archivo supera 100 MB' }, { status: 413 });
        const result = await importCentralDatabase(JSON.parse(await file.text()));
        return privateNoStoreJson({ success: true, central: true, ...result });
      }
    }
    if (type === 'now') {
      const backup = await createSqliteBackup('manual');
      await logAudit({ action: 'backup_created', entity: 'system', userId: auth.id, userName: auth.name, userRole: auth.role, summary: `Copia manual: ${backup.filename}` });
      return privateNoStoreJson({ success: true, ...backup });
    }
    if (type === 'import') {
      const form = await request.formData();
      const file = form.get('database');
      if (!(file instanceof File)) return privateNoStoreJson({ error: 'Falta el archivo database' }, { status: 400 });
      if (file.size > 500 * 1024 * 1024) return privateNoStoreJson({ error: 'El archivo supera 500 MB' }, { status: 413 });
      const restored = await restoreSqliteBackup(new Uint8Array(await file.arrayBuffer()));
      await logAudit({ action: 'backup_restored', entity: 'system', userId: auth.id, userName: auth.name, userRole: auth.role, summary: `Base restaurada (${restored.restoredBytes} bytes). Copia previa: ${restored.safetyBackup.filename}` });
      return privateNoStoreJson({ success: true, ...restored });
    }
    return privateNoStoreJson({ error: 'Tipo no válido' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de backup';
    await logAudit({ action: 'backup_failed', entity: 'system', userId: auth.id, userName: auth.name, userRole: auth.role, result: 'error', errorMessage: message });
    return genericInternalErrorResponse('Error al procesar la copia de seguridad');
  }
}
