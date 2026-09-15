import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/postgres-backup.ts'), 'utf8');
const validationStart = source.indexOf('function assertValidAndUniqueIds');
const validationEnd = source.indexOf('function encodeCostAuditDocuments');
const validationSource = source.slice(validationStart, validationEnd);

describe('central backup identity integrity regressions', () => {
  it('validates every required collection before destructive restore', () => {
    expect(validationSource).toContain('for (const key of REQUIRED_COLLECTIONS)');
    expect(source.indexOf('assertValidAndUniqueIds(data);')).toBeLessThan(source.indexOf('await db.$transaction(async (tx) =>', source.indexOf('export async function importCentralDatabase')));
  });

  it('rejects missing, non-string and blank record identifiers', () => {
    expect(validationSource).toContain("typeof row.id !== 'string'");
    expect(validationSource).toContain('row.id.trim().length === 0');
  });

  it('rejects duplicate identifiers within a collection before createMany', () => {
    expect(validationSource).toContain('const seen = new Set<string>()');
    expect(validationSource).toContain('if (seen.has(row.id))');
  });

  it('keeps identity validation fail-closed instead of silently skipping duplicate rows', () => {
    expect(source).not.toContain('skipDuplicates: true');
    expect(validationSource).toContain('throw new Error(`La copia contiene un identificador duplicado');
  });
});
