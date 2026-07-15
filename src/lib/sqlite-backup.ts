import { copyFile, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';

export type BackupKind = 'automatic' | 'manual' | 'pre-import';
export interface BackupInfo { filename: string; size: number; createdAt: string; kind: BackupKind }

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'utf8');
const BACKUP_FILE = /^gasi-(automatic|manual|pre-import)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?\.sqlite$/;

export function resolveSqlitePath(databaseUrl = process.env.DATABASE_URL || 'file:../db/custom.db'): string {
  if (!databaseUrl.startsWith('file:')) throw new Error('El backup automático requiere una base SQLite (DATABASE_URL file:)');
  const raw = databaseUrl.slice(5).split('?')[0];
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), 'prisma', raw);
}

export function backupDirectory(): string {
  return path.join(process.cwd(), 'backups');
}

export async function isValidSqliteFile(filePath: string): Promise<boolean> {
  try {
    const handle = await open(/* turbopackIgnore: true */ filePath, 'r');
    const header = Buffer.alloc(SQLITE_HEADER.length);
    await handle.read(header, 0, header.length, 0);
    await handle.close();
    return header.equals(SQLITE_HEADER);
  } catch { return false; }
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '').replace(/:/g, '-');
}

async function pruneAutomaticBackups(max = Number(process.env.GASI_BACKUP_RETENTION || 30)) {
  const automatic = (await listBackups()).filter((entry) => entry.kind === 'automatic');
  for (const expired of automatic.slice(Math.max(0, max))) {
    await rm(/* turbopackIgnore: true */ path.join(backupDirectory(), expired.filename), { force: true });
  }
}

export async function createSqliteBackup(kind: BackupKind, now = new Date()): Promise<BackupInfo> {
  const databasePath = resolveSqlitePath();
  if (!(await isValidSqliteFile(databasePath))) throw new Error('La base de datos SQLite no existe o no es válida');
  try { await db.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL)'); } catch { /* puede no haber WAL */ }
  await mkdir(/* turbopackIgnore: true */ backupDirectory(), { recursive: true });
  let filename = `gasi-${kind}-${timestamp(now)}.sqlite`;
  let destination = path.join(/* turbopackIgnore: true */ backupDirectory(), filename);
  let suffix = 1;
  while (await stat(/* turbopackIgnore: true */ destination).then(() => true).catch(() => false)) {
    filename = `gasi-${kind}-${timestamp(now)}-${suffix++}.sqlite`;
    destination = path.join(/* turbopackIgnore: true */ backupDirectory(), filename);
  }
  await copyFile(/* turbopackIgnore: true */ databasePath, destination);
  if (!(await isValidSqliteFile(destination))) {
    await rm(/* turbopackIgnore: true */ destination, { force: true });
    throw new Error('La copia creada no supera la verificación SQLite');
  }
  if (kind === 'automatic') await pruneAutomaticBackups();
  const metadata = await stat(/* turbopackIgnore: true */ destination);
  return { filename, size: metadata.size, createdAt: metadata.mtime.toISOString(), kind };
}

export async function listBackups(): Promise<BackupInfo[]> {
  await mkdir(/* turbopackIgnore: true */ backupDirectory(), { recursive: true });
  const names = await readdir(/* turbopackIgnore: true */ backupDirectory());
  const rows = await Promise.all(names.filter((name) => BACKUP_FILE.test(name)).map(async (filename) => {
    const metadata = await stat(/* turbopackIgnore: true */ path.join(backupDirectory(), filename));
    const match = filename.match(BACKUP_FILE)!;
    return { filename, size: metadata.size, createdAt: metadata.mtime.toISOString(), kind: match[1] as BackupKind };
  }));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function safeBackupPath(filename: string): string {
  if (!BACKUP_FILE.test(filename) || path.basename(filename) !== filename) throw new Error('Nombre de copia no válido');
  return path.join(/* turbopackIgnore: true */ backupDirectory(), filename);
}

let automaticPromise: Promise<BackupInfo | null> | null = null;
export async function ensureDailyAutomaticBackup(now = new Date()): Promise<BackupInfo | null> {
  if (automaticPromise) return automaticPromise;
  automaticPromise = (async () => {
    const day = now.toISOString().slice(0, 10);
    const existing = (await listBackups()).find((entry) => entry.kind === 'automatic' && entry.filename.includes(day));
    return existing ?? createSqliteBackup('automatic', now);
  })();
  try { return await automaticPromise; } finally { automaticPromise = null; }
}

async function validateImportedSchema(filePath: string) {
  const candidate = new PrismaClient({ datasources: { db: { url: `file:${filePath}` } } });
  try {
    const rows = await candidate.$queryRawUnsafe<Array<{ name: string }>>('SELECT name FROM sqlite_master WHERE type = \'table\'');
    const tables = new Set(rows.map((row) => row.name));
    for (const required of ['User', 'Budget', 'AppConfig']) {
      if (!tables.has(required)) throw new Error(`La copia no contiene la tabla obligatoria ${required}`);
    }
    const budgetColumns = await candidate.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("Budget")');
    const quoteColumns = await candidate.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("CostingQuote")');
    const budgetColumnNames = new Set(budgetColumns.map((row) => row.name));
    const quoteColumnNames = new Set(quoteColumns.map((row) => row.name));
    for (const required of ['serviceLocationId', 'serviceAutonomousCommunity', 'serviceProvince']) {
      if (!budgetColumnNames.has(required)) throw new Error(`La copia usa un esquema antiguo: falta Budget.${required}`);
    }
    if (!quoteColumnNames.has('budgetId')) throw new Error('La copia usa un esquema antiguo: falta CostingQuote.budgetId');
  } finally { await candidate.$disconnect(); }
}

export async function restoreSqliteBackup(contents: Uint8Array): Promise<{ restoredBytes: number; safetyBackup: BackupInfo }> {
  const databasePath = resolveSqlitePath();
  await mkdir(/* turbopackIgnore: true */ path.dirname(databasePath), { recursive: true });
  const candidatePath = `${databasePath}.import-${Date.now()}`;
  const previousPath = `${databasePath}.previous-${Date.now()}`;
  await writeFile(/* turbopackIgnore: true */ candidatePath, contents);
  try {
    if (!(await isValidSqliteFile(candidatePath))) throw new Error('El archivo importado no es una base SQLite válida');
    await validateImportedSchema(candidatePath);
    const safetyBackup = await createSqliteBackup('pre-import');
    await db.$disconnect();
    await rename(/* turbopackIgnore: true */ databasePath, previousPath);
    try {
      await rename(/* turbopackIgnore: true */ candidatePath, databasePath);
      await rm(/* turbopackIgnore: true */ `${databasePath}-wal`, { force: true });
      await rm(/* turbopackIgnore: true */ `${databasePath}-shm`, { force: true });
      await db.$connect();
      await db.$queryRawUnsafe('SELECT 1');
      await rm(/* turbopackIgnore: true */ previousPath, { force: true });
      return { restoredBytes: contents.byteLength, safetyBackup };
    } catch (error) {
      await db.$disconnect().catch(() => undefined);
      await rm(/* turbopackIgnore: true */ databasePath, { force: true });
      await rename(/* turbopackIgnore: true */ previousPath, databasePath);
      await db.$connect();
      throw error;
    }
  } finally {
    await rm(/* turbopackIgnore: true */ candidatePath, { force: true });
  }
}

export async function readBackup(filename: string): Promise<Buffer> {
  const filePath = safeBackupPath(filename);
  if (!(await isValidSqliteFile(filePath))) throw new Error('La copia no existe o no es válida');
  return readFile(/* turbopackIgnore: true */ filePath);
}
