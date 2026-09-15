import { db } from '@/lib/db';

const FORMAT = 'gasi-mediquote-postgres-v2';

const REQUIRED_COLLECTIONS = [
  'users', 'clients', 'budgets', 'serviceBlocks', 'budgetHistory', 'internalMessages', 'budgetApprovals',
  'notifications', 'costAudits', 'budgetSignatureRequests', 'professionalCategories', 'surchargeConfigs', 'holidays',
  'laborRules', 'appConfigs', 'costingQuotes', 'auditLogs', 'legalRecords', 'legalParameters', 'configAuditLogs',
] as const;

type BackupCollection = (typeof REQUIRED_COLLECTIONS)[number];
type BackupData = Record<BackupCollection, unknown[]>;

function isBackupCollection(key: string): key is BackupCollection {
  return (REQUIRED_COLLECTIONS as readonly string[]).includes(key);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertCompleteBackup(value: unknown): asserts value is { format: string; createdAt: string; data: BackupData } {
  if (!isPlainRecord(value)) throw new Error('La copia no es una exportación válida de GASI');
  const backup = value as { format?: unknown; createdAt?: unknown; data?: unknown };
  if (backup.format !== FORMAT || !isPlainRecord(backup.data)) throw new Error('La copia no es una exportación válida de GASI');
  if (typeof backup.createdAt !== 'string' || !Number.isFinite(Date.parse(backup.createdAt))) {
    throw new Error('La copia no contiene una fecha de creación válida');
  }
  const data = backup.data as Record<string, unknown>;
  const missing = REQUIRED_COLLECTIONS.filter((key) => !Array.isArray(data[key]));
  if (missing.length) throw new Error(`La copia está incompleta y no se restaurará: faltan ${missing.join(', ')}`);
  const unexpected = Object.keys(data).filter((key) => !isBackupCollection(key));
  if (unexpected.length) throw new Error(`La copia contiene colecciones no reconocidas y no se restaurará: ${unexpected.join(', ')}`);
  for (const key of REQUIRED_COLLECTIONS) {
    const invalidIndex = (data[key] as unknown[]).findIndex((row) => !isPlainRecord(row));
    if (invalidIndex !== -1) throw new Error(`La copia contiene un registro inválido en ${key}[${invalidIndex}]`);
  }
}

function encodeCostAuditDocuments(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({ ...row, documentData: row.documentData == null ? null : Buffer.from(row.documentData as Uint8Array).toString('base64') }));
}

function decodeStrictBase64(value: string) {
  if (value.length === 0) return Buffer.alloc(0);
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Documento de CostAudit inválido en la copia');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) throw new Error('Documento de CostAudit inválido en la copia');
  return decoded;
}

function decodeCostAuditDocuments(rows: unknown[]) {
  return rows.map((value) => {
    if (!isPlainRecord(value)) throw new Error('CostAudit inválido en la copia');
    const row = value as Record<string, unknown>;
    if (row.documentData != null && typeof row.documentData !== 'string') throw new Error('Documento de CostAudit inválido en la copia');
    return { ...row, documentData: typeof row.documentData === 'string' ? decodeStrictBase64(row.documentData) : null };
  });
}

export async function exportCentralDatabase() {
  // All collections must belong to one database snapshot. Sequential reads outside a
  // transaction can mix pre/post-write states and produce a structurally valid but
  // referentially inconsistent backup under concurrent production traffic.
  const data = await db.$transaction(async (tx) => {
    const costAudits = await tx.costAudit.findMany();
    return {
      users: await tx.user.findMany(), clients: await tx.client.findMany(), budgets: await tx.budget.findMany(), serviceBlocks: await tx.serviceBlock.findMany(),
      budgetHistory: await tx.budgetHistory.findMany(), internalMessages: await tx.internalMessage.findMany(), budgetApprovals: await tx.budgetApproval.findMany(),
      notifications: await tx.notification.findMany(), costAudits: encodeCostAuditDocuments(costAudits as unknown as Array<Record<string, unknown>>),
      budgetSignatureRequests: await tx.budgetSignatureRequest.findMany(), professionalCategories: await tx.professionalCategory.findMany(),
      surchargeConfigs: await tx.surchargeConfig.findMany(), holidays: await tx.holiday.findMany(), laborRules: await tx.laborRule.findMany(), appConfigs: await tx.appConfig.findMany(),
      costingQuotes: await tx.costingQuote.findMany(), auditLogs: await tx.auditLog.findMany(), legalRecords: await tx.legalRecord.findMany(),
      legalParameters: await tx.legalParameter.findMany(), configAuditLogs: await tx.configAuditLog.findMany(),
    } satisfies BackupData;
  }, { isolationLevel: 'Serializable', timeout: 120_000 });
  return { format: FORMAT, createdAt: new Date().toISOString(), data };
}

export async function importCentralDatabase(value: unknown) {
  assertCompleteBackup(value);
  const d = value.data;
  // Decode and validate all binary evidence before opening the destructive transaction.
  const costAudits = decodeCostAuditDocuments(d.costAudits);

  await db.$transaction(async (tx) => {
    await tx.budgetSignatureRequest.deleteMany(); await tx.costAudit.deleteMany(); await tx.budgetApproval.deleteMany(); await tx.internalMessage.deleteMany();
    await tx.notification.deleteMany(); await tx.budgetHistory.deleteMany(); await tx.serviceBlock.deleteMany(); await tx.costingQuote.deleteMany(); await tx.budget.deleteMany();
    await tx.client.deleteMany(); await tx.legalParameter.deleteMany(); await tx.legalRecord.deleteMany(); await tx.auditLog.deleteMany(); await tx.configAuditLog.deleteMany();
    await tx.professionalCategory.deleteMany(); await tx.surchargeConfig.deleteMany(); await tx.holiday.deleteMany(); await tx.laborRule.deleteMany(); await tx.appConfig.deleteMany(); await tx.user.deleteMany();

    const create = async (rows: unknown[] | undefined, fn: (args: { data: any[] }) => Promise<unknown>) => { if (rows?.length) await fn({ data: rows }); };
    await create(d.users, tx.user.createMany.bind(tx.user)); await create(d.clients, tx.client.createMany.bind(tx.client)); await create(d.budgets, tx.budget.createMany.bind(tx.budget));
    await create(d.serviceBlocks, tx.serviceBlock.createMany.bind(tx.serviceBlock)); await create(d.budgetHistory, tx.budgetHistory.createMany.bind(tx.budgetHistory));
    await create(d.internalMessages, tx.internalMessage.createMany.bind(tx.internalMessage)); await create(d.budgetApprovals, tx.budgetApproval.createMany.bind(tx.budgetApproval));
    await create(d.notifications, tx.notification.createMany.bind(tx.notification)); await create(costAudits, tx.costAudit.createMany.bind(tx.costAudit));
    await create(d.budgetSignatureRequests, tx.budgetSignatureRequest.createMany.bind(tx.budgetSignatureRequest)); await create(d.professionalCategories, tx.professionalCategory.createMany.bind(tx.professionalCategory));
    await create(d.surchargeConfigs, tx.surchargeConfig.createMany.bind(tx.surchargeConfig)); await create(d.holidays, tx.holiday.createMany.bind(tx.holiday));
    await create(d.laborRules, tx.laborRule.createMany.bind(tx.laborRule)); await create(d.appConfigs, tx.appConfig.createMany.bind(tx.appConfig)); await create(d.costingQuotes, tx.costingQuote.createMany.bind(tx.costingQuote));
    await create(d.auditLogs, tx.auditLog.createMany.bind(tx.auditLog)); await create(d.legalRecords, tx.legalRecord.createMany.bind(tx.legalRecord));
    await create(d.legalParameters, tx.legalParameter.createMany.bind(tx.legalParameter)); await create(d.configAuditLogs, tx.configAuditLog.createMany.bind(tx.configAuditLog));
  }, { timeout: 120_000 });

  const restoredByCollection = Object.fromEntries(REQUIRED_COLLECTIONS.map((key) => [key, d[key].length])) as Record<BackupCollection, number>;
  return { restored: Object.values(restoredByCollection).reduce((total, count) => total + count, 0), restoredByCollection };
}
