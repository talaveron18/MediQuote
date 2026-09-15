import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/postgres-backup.ts'), 'utf8');
const exportStart = source.indexOf('export async function exportCentralDatabase()');
const importStart = source.indexOf('export async function importCentralDatabase');
const exportSource = source.slice(exportStart, importStart);

describe('central backup snapshot atomicity regressions', () => {
  it('reads the complete central export inside one database transaction', () => {
    expect(exportSource).toContain('db.$transaction(async (tx) =>');
    expect(exportSource).not.toContain('await db.user.findMany()');
    expect(exportSource).not.toContain('await db.costAudit.findMany()');
  });

  it('uses the transaction client for principal and dependent budget evidence', () => {
    expect(exportSource).toContain('users: await tx.user.findMany()');
    expect(exportSource).toContain('budgets: await tx.budget.findMany()');
    expect(exportSource).toContain('budgetApprovals: await tx.budgetApproval.findMany()');
    expect(exportSource).toContain('budgetSignatureRequests: await tx.budgetSignatureRequest.findMany()');
  });

  it('requests serializable isolation so concurrent writes cannot create a mixed-state snapshot', () => {
    expect(exportSource).toContain("isolationLevel: 'Serializable'");
  });

  it('bounds the snapshot transaction instead of allowing an unbounded production read', () => {
    expect(exportSource).toContain('timeout: 120_000');
  });
});
