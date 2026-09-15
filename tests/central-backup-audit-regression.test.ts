import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/backup/route.ts'), 'utf8');

describe('central backup audit regressions', () => {
  it('audits preparation of a central manual backup', () => {
    expect(route).toMatch(/type === 'now'[\s\S]*?action: 'backup_created'[\s\S]*?Copia central manual preparada/);
  });

  it('audits every central backup download/export', () => {
    expect(route).toMatch(/type === 'download' \|\| type === 'export'[\s\S]*?action: 'backup_exported'[\s\S]*?Copia central exportada/);
  });

  it('records a central restore only after the restore transaction has completed', () => {
    const importCall = route.indexOf('const result = await importCentralDatabase');
    const restoredAudit = route.indexOf("action: 'backup_restored'", importCall);
    expect(importCall).toBeGreaterThan(-1);
    expect(restoredAudit).toBeGreaterThan(importCall);
  });

  it('keeps failed backup/restore operations auditable without exposing the internal error to clients', () => {
    expect(route).toContain("action: 'backup_failed'");
    expect(route).toContain("genericInternalErrorResponse('Error al procesar la copia de seguridad')");
    expect(route).not.toMatch(/privateNoStoreJson\(\{[^}]*error:\s*message/);
  });
});
