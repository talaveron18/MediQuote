import { NextRequest, NextResponse } from 'next/server';
import { requireRole, logAudit } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  mkdirSync,
  copyFileSync,
  existsSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { dataRoot } from '@/lib/data-paths';
import { resolveSqlitePath } from '@/lib/sqlite-backup';
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response';

const BASE = dataRoot();

// ─── POST ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (type === 'generate') {
      return handleAuditPackage(auth.id, auth.name, auth.role);
    }

    return privateNoStoreJson({ error: 'Tipo no válido. Use type=generate' }, { status: 400 });
  } catch (error) {
    console.error('[POST /api/audit-package] Error:', error);
    return genericInternalErrorResponse('Error al generar el paquete de auditoría');
  }
}

// ─── Audit Package Handler ─────────────────────────────────────

async function handleAuditPackage(userId: string, userName: string, userRole: string) {
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const timeStr = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('-');
  const folderName = `gasi-auditoria-${dateStr}-${timeStr}`;

  const auditDir = path.join(BASE, 'exports', 'auditoria', folderName);
  mkdirSync(auditDir, { recursive: true });

  const pdfSubDir = path.join(auditDir, 'presupuestos_pdf');
  const jsonSubDir = path.join(auditDir, 'presupuestos_json');
  mkdirSync(pdfSubDir, { recursive: true });
  mkdirSync(jsonSubDir, { recursive: true });

  const copiedFiles: string[] = [];

  const dbAbsPath = resolveSqlitePath();
  if (existsSync(dbAbsPath)) {
    copyFileSync(dbAbsPath, path.join(auditDir, 'database.sqlite'));
    copiedFiles.push('database.sqlite');
  }

  const srcPdfDir = path.join(BASE, 'exports', 'presupuestos', 'pdf');
  if (existsSync(srcPdfDir)) {
    const fs = await import('fs/promises');
    try {
      const pdfFiles = await fs.readdir(srcPdfDir);
      for (const f of pdfFiles) {
        const src = path.join(srcPdfDir, f);
        const stat = await fs.stat(src);
        if (stat.isFile()) {
          copyFileSync(src, path.join(pdfSubDir, f));
          copiedFiles.push(`presupuestos_pdf/${f}`);
        }
      }
    } catch {
      // Optional export source unavailable.
    }
  }

  const srcJsonDir = path.join(BASE, 'exports', 'presupuestos', 'json');
  if (existsSync(srcJsonDir)) {
    const fs = await import('fs/promises');
    try {
      const jsonFiles = await fs.readdir(srcJsonDir);
      for (const f of jsonFiles) {
        const src = path.join(srcJsonDir, f);
        const stat = await fs.stat(src);
        if (stat.isFile()) {
          copyFileSync(src, path.join(jsonSubDir, f));
          copiedFiles.push(`presupuestos_json/${f}`);
        }
      }
    } catch {
      // Optional export source unavailable.
    }
  }

  const csvSrc = path.join(BASE, 'exports', 'presupuestos_resumen.csv');
  if (existsSync(csvSrc)) {
    copyFileSync(csvSrc, path.join(auditDir, 'presupuestos_resumen.csv'));
    copiedFiles.push('presupuestos_resumen.csv');
  }

  const configSrc = path.join(BASE, 'remote-config', 'gasi-config.json');
  if (existsSync(configSrc)) {
    copyFileSync(configSrc, path.join(auditDir, 'gasi-config.json'));
    copiedFiles.push('gasi-config.json');
  }

  const auditLogs = await db.auditLog.findMany({
    orderBy: { createdAt: 'asc' },
    take: 10000,
  });

  const csvHeader = 'date,user,role,action,entity,result,message';
  const csvRows = auditLogs.map(log => {
    const date = log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt);
    return [
      csvEscape(date),
      csvEscape(log.userName || log.userId || ''),
      csvEscape(log.userRole || ''),
      csvEscape(log.action),
      csvEscape(log.entity || ''),
      csvEscape(log.result),
      csvEscape(log.errorMessage || log.summary || ''),
    ].join(',');
  });
  writeFileSync(
    path.join(auditDir, 'audit-log.csv'),
    csvHeader + '\n' + csvRows.join('\n') + '\n',
    'utf-8',
  );
  copiedFiles.push('audit-log.csv');

  const jsonlLines = auditLogs.map(log => JSON.stringify({
    date: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
    user: log.userName || log.userId || null,
    role: log.userRole || null,
    action: log.action,
    entity: log.entity || null,
    entityId: log.entityId || null,
    result: log.result,
    message: log.errorMessage || log.summary || null,
  }));
  writeFileSync(
    path.join(auditDir, 'audit-log.jsonl'),
    jsonlLines.join('\n') + '\n',
    'utf-8',
  );
  copiedFiles.push('audit-log.jsonl');

  const versionInfo = [
    `GASI Presupuestos - Información de Versión`,
    `Generado: ${now.toISOString()}`,
    `Generado por: ${userName} (${userRole})`,
    ``,
    `APP_VERSION: ${process.env.APP_VERSION || '0.1.0'}`,
    `CALCULATION_ENGINE_VERSION: ${process.env.CALCULATION_ENGINE_VERSION || '2.0.0'}`,
    `NODE_ENV: ${process.env.NODE_ENV || 'development'}`,
    ``,
    `Archivos incluidos: ${copiedFiles.length}`,
    ...copiedFiles.map(f => `  - ${f}`),
  ].join('\n');
  writeFileSync(path.join(auditDir, 'version-info.txt'), versionInfo, 'utf-8');
  copiedFiles.push('version-info.txt');

  await logAudit({
    action: 'audit_package_generated',
    entity: 'system',
    userId,
    userName,
    userRole,
    summary: `Paquete de auditoría generado: ${folderName} (${copiedFiles.length} archivos)`,
  });

  return privateNoStoreJson({
    success: true,
    path: `exports/auditoria/${folderName}/`,
    folderName,
    files: copiedFiles,
    filesCount: copiedFiles.length,
  });
}

function csvEscape(value: string): string {
  if (!value) return '""';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
