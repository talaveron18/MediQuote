import { db } from '@/lib/db';

const FORMAT = 'gasi-mediquote-postgres-v1';

export async function exportCentralDatabase() {
  const data = {
    users: await db.user.findMany(), clients: await db.client.findMany(), budgets: await db.budget.findMany(),
    serviceBlocks: await db.serviceBlock.findMany(), budgetHistory: await db.budgetHistory.findMany(),
    professionalCategories: await db.professionalCategory.findMany(), surchargeConfigs: await db.surchargeConfig.findMany(),
    holidays: await db.holiday.findMany(), laborRules: await db.laborRule.findMany(), appConfigs: await db.appConfig.findMany(),
    costingQuotes: await db.costingQuote.findMany(), auditLogs: await db.auditLog.findMany(),
    legalRecords: await db.legalRecord.findMany(), legalParameters: await db.legalParameter.findMany(),
    configAuditLogs: await db.configAuditLog.findMany(),
  };
  return { format: FORMAT, createdAt: new Date().toISOString(), data };
}

export async function importCentralDatabase(value: unknown) {
  const backup = value as { format?: string; data?: Record<string, unknown[]> };
  if (backup?.format !== FORMAT || !backup.data || !Array.isArray(backup.data.users)) throw new Error('La copia no es una exportación válida de GASI');
  const d = backup.data;
  await db.$transaction(async (tx) => {
    await tx.budgetHistory.deleteMany(); await tx.serviceBlock.deleteMany(); await tx.costingQuote.deleteMany();
    await tx.budget.deleteMany(); await tx.client.deleteMany(); await tx.legalParameter.deleteMany();
    await tx.legalRecord.deleteMany(); await tx.auditLog.deleteMany(); await tx.configAuditLog.deleteMany();
    await tx.professionalCategory.deleteMany(); await tx.surchargeConfig.deleteMany(); await tx.holiday.deleteMany();
    await tx.laborRule.deleteMany(); await tx.appConfig.deleteMany(); await tx.user.deleteMany();
    const create = async (rows: unknown[] | undefined, fn: (args: { data: never[] }) => Promise<unknown>) => {
      if (rows?.length) await fn({ data: rows as never[] });
    };
    await create(d.users, tx.user.createMany.bind(tx.user)); await create(d.clients, tx.client.createMany.bind(tx.client));
    await create(d.budgets, tx.budget.createMany.bind(tx.budget)); await create(d.serviceBlocks, tx.serviceBlock.createMany.bind(tx.serviceBlock));
    await create(d.budgetHistory, tx.budgetHistory.createMany.bind(tx.budgetHistory));
    await create(d.professionalCategories, tx.professionalCategory.createMany.bind(tx.professionalCategory));
    await create(d.surchargeConfigs, tx.surchargeConfig.createMany.bind(tx.surchargeConfig)); await create(d.holidays, tx.holiday.createMany.bind(tx.holiday));
    await create(d.laborRules, tx.laborRule.createMany.bind(tx.laborRule)); await create(d.appConfigs, tx.appConfig.createMany.bind(tx.appConfig));
    await create(d.costingQuotes, tx.costingQuote.createMany.bind(tx.costingQuote)); await create(d.auditLogs, tx.auditLog.createMany.bind(tx.auditLog));
    await create(d.legalRecords, tx.legalRecord.createMany.bind(tx.legalRecord)); await create(d.legalParameters, tx.legalParameter.createMany.bind(tx.legalParameter));
    await create(d.configAuditLogs, tx.configAuditLog.createMany.bind(tx.configAuditLog));
  }, { timeout: 120_000 });
  return { restored: Object.values(d).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0) };
}
