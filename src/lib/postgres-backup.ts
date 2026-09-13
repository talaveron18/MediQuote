import { db } from '@/lib/db';

const FORMAT = 'gasi-mediquote-postgres-v2';

const REQUIRED_COLLECTIONS = [
  'users',
  'clients',
  'budgets',
  'serviceBlocks',
  'budgetHistory',
  'internalMessages',
  'budgetApprovals',
  'notifications',
  'costAudits',
  'budgetSignatureRequests',
  'professionalCategories',
  'surchargeConfigs',
  'holidays',
  'laborRules',
  'appConfigs',
  'costingQuotes',
  'auditLogs',
  'legalRecords',
  'legalParameters',
  'configAuditLogs',
] as const;

type BackupData = Record<(typeof REQUIRED_COLLECTIONS)[number], unknown[]>;

function assertCompleteBackup(value: unknown): asserts value is { format: string; data: BackupData } {
  if (!value || typeof value !== 'object') throw new Error('La copia no es una exportación válida de GASI');
  const backup = value as { format?: unknown; data?: unknown };
  if (backup.format !== FORMAT || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    throw new Error('La copia no es una exportación válida de GASI');
  }
  const data = backup.data as Record<string, unknown>;
  const missing = REQUIRED_COLLECTIONS.filter((key) => !Array.isArray(data[key]));
  if (missing.length) {
    throw new Error(`La copia está incompleta y no se restaurará: faltan ${missing.join(', ')}`);
  }
}

function encodeCostAuditDocuments(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    ...row,
    documentData: row.documentData == null ? null : Buffer.from(row.documentData as Uint8Array).toString('base64'),
  }));
}

function decodeCostAuditDocuments(rows: unknown[]) {
  return rows.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CostAudit inválido en la copia');
    const row = value as Record<string, unknown>;
    if (row.documentData != null && typeof row.documentData !== 'string') throw new Error('Documento de CostAudit inválido en la copia');
    return {
      ...row,
      documentData: typeof row.documentData === 'string' ? Buffer.from(row.documentData, 'base64') : null,
    };
  });
}

export async function exportCentralDatabase() {
  const costAudits = await db.costAudit.findMany();
  const data = {
    users: await db.user.findMany(),
    clients: await db.client.findMany(),
    budgets: await db.budget.findMany(),
    serviceBlocks: await db.serviceBlock.findMany(),
    budgetHistory: await db.budgetHistory.findMany(),
    internalMessages: await db.internalMessage.findMany(),
    budgetApprovals: await db.budgetApproval.findMany(),
    notifications: await db.notification.findMany(),
    costAudits: encodeCostAuditDocuments(costAudits as unknown as Array<Record<string, unknown>>),
    budgetSignatureRequests: await db.budgetSignatureRequest.findMany(),
    professionalCategories: await db.professionalCategory.findMany(),
    surchargeConfigs: await db.surchargeConfig.findMany(),
    holidays: await db.holiday.findMany(),
    laborRules: await db.laborRule.findMany(),
    appConfigs: await db.appConfig.findMany(),
    costingQuotes: await db.costingQuote.findMany(),
    auditLogs: await db.auditLog.findMany(),
    legalRecords: await db.legalRecord.findMany(),
    legalParameters: await db.legalParameter.findMany(),
    configAuditLogs: await db.configAuditLog.findMany(),
  } satisfies BackupData;
  return { format: FORMAT, createdAt: new Date().toISOString(), data };
}

export async function importCentralDatabase(value: unknown) {
  assertCompleteBackup(value);
  const d = value.data;
  const costAudits = decodeCostAuditDocuments(d.costAudits);

  await db.$transaction(async (tx) => {
    // Dependants first: never leave a restored budget with silently missing approval,
    // cost-audit, signature or communication state.
    await tx.budgetSignatureRequest.deleteMany();
    await tx.costAudit.deleteMany();
    await tx.budgetApproval.deleteMany();
    await tx.internalMessage.deleteMany();
    await tx.notification.deleteMany();
    await tx.budgetHistory.deleteMany();
    await tx.serviceBlock.deleteMany();
    await tx.costingQuote.deleteMany();
    await tx.budget.deleteMany();
    await tx.client.deleteMany();
    await tx.legalParameter.deleteMany();
    await tx.legalRecord.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.configAuditLog.deleteMany();
    await tx.professionalCategory.deleteMany();
    await tx.surchargeConfig.deleteMany();
    await tx.holiday.deleteMany();
    await tx.laborRule.deleteMany();
    await tx.appConfig.deleteMany();
    await tx.user.deleteMany();

    const create = async (rows: unknown[] | undefined, fn: (args: { data: never[] }) => Promise<unknown>) => {
      if (rows?.length) await fn({ data: rows as never[] });
    };

    // Principals first, then their dependant workflow/evidence records.
    await create(d.users, tx.user.createMany.bind(tx.user));
    await create(d.clients, tx.client.createMany.bind(tx.client));
    await create(d.budgets, tx.budget.createMany.bind(tx.budget));
    await create(d.serviceBlocks, tx.serviceBlock.createMany.bind(tx.serviceBlock));
    await create(d.budgetHistory, tx.budgetHistory.createMany.bind(tx.budgetHistory));
    await create(d.internalMessages, tx.internalMessage.createMany.bind(tx.internalMessage));
    await create(d.budgetApprovals, tx.budgetApproval.createMany.bind(tx.budgetApproval));
    await create(d.notifications, tx.notification.createMany.bind(tx.notification));
    await create(costAudits, tx.costAudit.createMany.bind(tx.costAudit));
    await create(d.budgetSignatureRequests, tx.budgetSignatureRequest.createMany.bind(tx.budgetSignatureRequest));
    await create(d.professionalCategories, tx.professionalCategory.createMany.bind(tx.professionalCategory));
    await create(d.surchargeConfigs, tx.surchargeConfig.createMany.bind(tx.surchargeConfig));
    await create(d.holidays, tx.holiday.createMany.bind(tx.holiday));
    await create(d.laborRules, tx.laborRule.createMany.bind(tx.laborRule));
    await create(d.appConfigs, tx.appConfig.createMany.bind(tx.appConfig));
    await create(d.costingQuotes, tx.costingQuote.createMany.bind(tx.costingQuote));
    await create(d.auditLogs, tx.auditLog.createMany.bind(tx.auditLog));
    await create(d.legalRecords, tx.legalRecord.createMany.bind(tx.legalRecord));
    await create(d.legalParameters, tx.legalParameter.createMany.bind(tx.legalParameter));
    await create(d.configAuditLogs, tx.configAuditLog.createMany.bind(tx.configAuditLog));
  }, { timeout: 120_000 });

  return { restored: REQUIRED_COLLECTIONS.reduce((n, key) => n + d[key].length, 0) };
}
