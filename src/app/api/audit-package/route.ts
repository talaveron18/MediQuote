import { NextRequest, NextResponse } from 'next/server';
import { requireRole, logAudit } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  mkdirSync,
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { dataRoot } from '@/lib/data-paths';
import { APP_VERSION, COST_ENGINE_VERSION } from '@/lib/costing/cost-types';
import { resolveSqlitePath } from '@/lib/sqlite-backup';

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

    return NextResponse.json({ error: 'Tipo no válido. Use type=generate' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[POST /api/audit-package] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
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

  // Create audit directory
  const auditDir = path.join(BASE, 'exports', 'auditoria', folderName);
  mkdirSync(auditDir, { recursive: true });

  // Subdirectories
  const pdfSubDir = path.join(auditDir, 'presupuestos_pdf');
  const jsonSubDir = path.join(auditDir, 'presupuestos_json');
  mkdirSync(pdfSubDir, { recursive: true });
  mkdirSync(jsonSubDir, { recursive: true });

  const copiedFiles: string[] = [];

  // ─── 1. Copy database ─────────────────────────────────────
  const dbAbsPath = resolveSqlitePath();
  if (existsSync(dbAbsPath)) {
    copyFileSync(dbAbsPath, path.join(auditDir, 'database.sqlite'));
    copiedFiles.push('database.sqlite');
  }

  // ─── 2. Copy PDF exports ──────────────────────────────────
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
      // Directory doesn't exist or can't be read
    }
  }

  // ─── 3. Copy JSON exports ─────────────────────────────────
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
      // Directory doesn't exist or can't be read
    }
  }

  // ─── 4. Copy CSV summary ──────────────────────────────────
  const csvSrc = path.join(BASE, 'exports', 'presupuestos_resumen.csv');
  if (existsSync(csvSrc)) {
    copyFileSync(csvSrc, path.join(auditDir, 'presupuestos_resumen.csv'));
    copiedFiles.push('presupuestos_resumen.csv');
  }

  // ─── 5. Copy remote config ────────────────────────────────
  const configSrc = path.join(BASE, 'remote-config', 'gasi-config.json');
  if (existsSync(configSrc)) {
    copyFileSync(configSrc, path.join(auditDir, 'gasi-config.json'));
    copiedFiles.push('gasi-config.json');
  }

  // ─── 6. Generate audit-log.csv ────────────────────────────
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

  // ─── 7. Generate audit-log.jsonl ──────────────────────────
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

  // ─── 8. Generate version-info.txt ─────────────────────────
  const versionInfo = [
    `GASI Presupuestos - Información de Versión`,
    `Generado: ${now.toISOString()}`,
    `Generado por: ${userName} (${userRole})`,
    ``,
    `APP_VERSION: ${APP_VERSION}`,
    `CALCULATION_ENGINE_VERSION: ${COST_ENGINE_VERSION}`,
    `NODE_ENV: ${process.env.NODE_ENV || 'development'}`,
    ``,
    `Archivos incluidos: ${copiedFiles.length}`,
    ...copiedFiles.map(f => `  - ${f}`),
  ].join('\n');
  writeFileSync(path.join(auditDir, 'version-info.txt'), versionInfo, 'utf-8');
  copiedFiles.push('version-info.txt');

  // Audit log
  await logAudit({
    action: 'audit_package_generated',
    entity: 'system',
    userId,
    userName,
    userRole,
    summary: `Paquete de auditoría generado: ${folderName} (${copiedFiles.length} archivos)`,
  });

  return NextResponse.json({
    success: true,
    path: `exports/auditoria/${folderName}/`,
    folderName,
    files: copiedFiles,
    filesCount: copiedFiles.length,
  });
}

// ─── CSV Helper ────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (!value) return '""';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
