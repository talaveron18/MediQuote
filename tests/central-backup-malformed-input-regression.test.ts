import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/postgres-backup.ts'), 'utf8');

describe('central backup malformed-input fail-closed regressions', () => {
  it('requires a parseable snapshot creation timestamp before destructive restore', () => {
    expect(source).toContain("typeof backup.createdAt !== 'string'");
    expect(source).toContain('Date.parse(backup.createdAt)');
  });

  it('rejects malformed collection rows before opening the transaction', () => {
    expect(source).toContain('findIndex((row) => !isPlainRecord(row))');
    expect(source.indexOf('assertCompleteBackup(value)')).toBeLessThan(source.indexOf('db.$transaction'));
  });

  it('validates binary cost-audit evidence as canonical base64 before destructive restore', () => {
    expect(source).toContain('decodeStrictBase64');
    expect(source).toContain("decoded.toString('base64') !== value");
    expect(source.indexOf('decodeCostAuditDocuments(d.costAudits)')).toBeLessThan(source.indexOf('db.$transaction'));
  });

  it('keeps schema drift fail-closed instead of accepting unknown collections', () => {
    expect(source).toContain('colecciones no reconocidas y no se restaurará');
    expect(source).toContain('Object.keys(data).filter');
  });
});
