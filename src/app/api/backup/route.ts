import { NextRequest, NextResponse } from 'next/server';
import { requireRole, logAudit } from '@/lib/auth';
import { mkdirSync, copyFileSync, existsSync } from 'fs';
import path from 'path';

const BASE = process.cwd();

// ─── POST ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (type === 'now') {
      return handleBackup(auth.id, auth.name, auth.role);
    }

    return NextResponse.json({ error: 'Tipo no válido. Use type=now' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[POST /api/backup] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Backup Handler ────────────────────────────────────────────

async function handleBackup(userId: string, userName: string, userRole: string) {
  // Parse SQLite path from DATABASE_URL
  const dbUrl = process.env.DATABASE_URL || 'file:../db/custom.db';
  // Format: file:../db/custom.db or file:./db/custom.db
  const dbRelativePath = dbUrl.replace(/^file:/, '');
  const dbAbsPath = path.resolve(
    /* turbopackIgnore: true */ BASE,
    dbRelativePath,
  );

  // Create backups directory
  const backupDir = path.join(BASE, 'backups');
  mkdirSync(backupDir, { recursive: true });

  // Generate dated filename
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
  const backupFileName = `gasi-backup-${dateStr}-${timeStr}.sqlite`;
  const backupPath = path.join(backupDir, backupFileName);

  // Copy the SQLite file
  if (!existsSync(dbAbsPath)) {
    return NextResponse.json({ error: 'Base de datos no encontrada' }, { status: 500 });
  }
  copyFileSync(dbAbsPath, backupPath);

  // Audit log
  await logAudit({
    action: 'backup_created',
    entity: 'system',
    userId,
    userName,
    userRole,
    summary: `Copia de seguridad creada: ${backupFileName}`,
  });

  return NextResponse.json({
    success: true,
    path: `backups/${backupFileName}`,
    filename: backupFileName,
  });
}
