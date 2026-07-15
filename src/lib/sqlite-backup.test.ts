import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { isValidSqliteFile, resolveSqlitePath, safeBackupPath } from './sqlite-backup';

const tempRoot = path.join(process.cwd(), '.test-sqlite-backup');
afterEach(async () => { await rm(tempRoot, { recursive: true, force: true }); });

describe('SQLite backup safety', () => {
  it('resolves file URLs relative to the Prisma schema directory', () => {
    expect(resolveSqlitePath('file:./db/custom.db')).toBe(path.join(process.cwd(), 'prisma', 'db', 'custom.db'));
  });

  it('validates the SQLite header before accepting an import', async () => {
    await mkdir(tempRoot, { recursive: true });
    const valid = path.join(tempRoot, 'valid.sqlite');
    const invalid = path.join(tempRoot, 'invalid.sqlite');
    await writeFile(valid, Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(100)]));
    await writeFile(invalid, 'not sqlite');
    expect(await isValidSqliteFile(valid)).toBe(true);
    expect(await isValidSqliteFile(invalid)).toBe(false);
  });

  it('rejects path traversal when downloading a backup', () => {
    expect(() => safeBackupPath('../database.sqlite')).toThrow('Nombre de copia no válido');
  });
});
