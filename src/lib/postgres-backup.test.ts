import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const delegate = () => ({
    findMany: vi.fn(async () => [] as unknown[]),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async (_args: { data: unknown[] }) => ({ count: 0 })),
  });
  const delegates = {
    user: delegate(), client: delegate(), budget: delegate(), serviceBlock: delegate(), budgetHistory: delegate(),
    internalMessage: delegate(), budgetApproval: delegate(), notification: delegate(), costAudit: delegate(),
    budgetSignatureRequest: delegate(), professionalCategory: delegate(), surchargeConfig: delegate(), holiday: delegate(),
    laborRule: delegate(), appConfig: delegate(), costingQuote: delegate(), auditLog: delegate(), legalRecord: delegate(),
    legalParameter: delegate(), configAuditLog: delegate(),
  };
  const transaction = vi.fn(async (callback: (tx: typeof delegates) => Promise<unknown>) => callback(delegates));
  return { delegates, transaction };
});

vi.mock('@/lib/db', () => ({ db: { ...mocks.delegates, $transaction: mocks.transaction } }));

import { exportCentralDatabase, importCentralDatabase } from '@/lib/postgres-backup';

const rows = () => [] as unknown[];
const emptyBackup = () => ({
  format: 'gasi-mediquote-postgres-v2',
  createdAt: '2026-09-13T00:00:00.000Z',
  data: {
    users: rows(), clients: rows(), budgets: rows(), serviceBlocks: rows(), budgetHistory: rows(), internalMessages: rows(), budgetApprovals: rows(),
    notifications: rows(), costAudits: rows(), budgetSignatureRequests: rows(), professionalCategories: rows(), surchargeConfigs: rows(),
    holidays: rows(), laborRules: rows(), appConfigs: rows(), costingQuotes: rows(), auditLogs: rows(), legalRecords: rows(), legalParameters: rows(),
    configAuditLogs: rows(),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const delegate of Object.values(mocks.delegates)) delegate.findMany.mockResolvedValue([]);
});

describe('central PostgreSQL backup integrity', () => {
  it('exports communication and approval workflow records instead of silently dropping them', async () => {
    mocks.delegates.internalMessage.findMany.mockResolvedValue([{ id: 'msg-1', budgetId: 'b-1' }]);
    mocks.delegates.budgetApproval.findMany.mockResolvedValue([{ id: 'approval-1', budgetId: 'b-1', status: 'approved' }]);
    mocks.delegates.notification.findMany.mockResolvedValue([{ id: 'notification-1', userId: 'u-1' }]);

    const backup = await exportCentralDatabase();

    expect(backup.format).toBe('gasi-mediquote-postgres-v2');
    expect(backup.data.internalMessages).toEqual([{ id: 'msg-1', budgetId: 'b-1' }]);
    expect(backup.data.budgetApprovals).toEqual([{ id: 'approval-1', budgetId: 'b-1', status: 'approved' }]);
    expect(backup.data.notifications).toEqual([{ id: 'notification-1', userId: 'u-1' }]);
  });

  it('round-trips cost-audit evidence through JSON without losing document bytes', async () => {
    mocks.delegates.costAudit.findMany.mockResolvedValue([{ id: 'audit-1', budgetId: 'b-1', documentData: Buffer.from([1, 2, 3, 255]) }]);
    const exported = await exportCentralDatabase();
    const roundTripped = JSON.parse(JSON.stringify(exported));

    await importCentralDatabase(roundTripped);

    expect(mocks.delegates.costAudit.createMany).toHaveBeenCalledTimes(1);
    const args = mocks.delegates.costAudit.createMany.mock.calls[0]?.[0];
    expect(args).toBeDefined();
    const restored = (args as { data: Array<{ documentData: Buffer }> }).data[0];
    expect(Buffer.isBuffer(restored.documentData)).toBe(true);
    expect([...restored.documentData]).toEqual([1, 2, 3, 255]);
  });

  it('restores approval, cost-audit and signature evidence only after their budget principal exists', async () => {
    const backup = emptyBackup();
    backup.data.users.push({ id: 'u-1' });
    backup.data.clients.push({ id: 'c-1' });
    backup.data.budgets.push({ id: 'b-1', clientId: 'c-1', createdById: 'u-1' });
    backup.data.budgetApprovals.push({ id: 'approval-1', budgetId: 'b-1', requesterId: 'u-1' });
    backup.data.costAudits.push({ id: 'audit-1', budgetId: 'b-1', createdById: 'u-1', documentData: null });
    backup.data.budgetSignatureRequests.push({ id: 'sig-1', budgetId: 'b-1', createdById: 'u-1' });

    const result = await importCentralDatabase(backup);

    const budgetCreateOrder = mocks.delegates.budget.createMany.mock.invocationCallOrder[0];
    expect(mocks.delegates.budgetApproval.createMany.mock.invocationCallOrder[0]).toBeGreaterThan(budgetCreateOrder);
    expect(mocks.delegates.costAudit.createMany.mock.invocationCallOrder[0]).toBeGreaterThan(budgetCreateOrder);
    expect(mocks.delegates.budgetSignatureRequest.createMany.mock.invocationCallOrder[0]).toBeGreaterThan(budgetCreateOrder);

    const budgetDeleteOrder = mocks.delegates.budget.deleteMany.mock.invocationCallOrder[0];
    expect(mocks.delegates.budgetApproval.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(budgetDeleteOrder);
    expect(mocks.delegates.costAudit.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(budgetDeleteOrder);
    expect(mocks.delegates.budgetSignatureRequest.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(budgetDeleteOrder);

    expect(result.restored).toBe(6);
    expect(result.restoredByCollection).toMatchObject({
      users: 1,
      clients: 1,
      budgets: 1,
      budgetApprovals: 1,
      costAudits: 1,
      budgetSignatureRequests: 1,
    });
  });

  it('fails closed before any destructive transaction when a backup is legacy or incomplete', async () => {
    const legacy = emptyBackup();
    legacy.format = 'gasi-mediquote-postgres-v1';
    await expect(importCentralDatabase(legacy)).rejects.toThrow('no es una exportación válida');

    const incomplete = emptyBackup();
    delete (incomplete.data as Partial<typeof incomplete.data>).budgetSignatureRequests;
    await expect(importCentralDatabase(incomplete)).rejects.toThrow('copia está incompleta');

    expect(mocks.transaction).not.toHaveBeenCalled();
    for (const delegate of Object.values(mocks.delegates)) expect(delegate.deleteMany).not.toHaveBeenCalled();
  });

  it('fails closed on schema drift instead of silently ignoring an unknown collection', async () => {
    const drifted = emptyBackup() as ReturnType<typeof emptyBackup> & { data: ReturnType<typeof emptyBackup>['data'] & Record<string, unknown[]> };
    drifted.data.futureCriticalEvidence = [{ id: 'future-1' }];

    await expect(importCentralDatabase(drifted)).rejects.toThrow('colecciones no reconocidas');

    expect(mocks.transaction).not.toHaveBeenCalled();
    for (const delegate of Object.values(mocks.delegates)) expect(delegate.deleteMany).not.toHaveBeenCalled();
  });
});
