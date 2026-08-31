// ─── Remote Configuration System ──────────────────────────────
// Allows admin to export config to JSON, commercial to import from JSON.
// File lives in /remote-config/gasi-config.json for folder sync (Drive/OneDrive/Dropbox).

import type { SurchargeType, SurchargeKind, HolidayType } from './types';
import { APP_VERSION, COST_ENGINE_VERSION } from '@/lib/costing/cost-types';

// ─── Remote Config File Structure ────────────────────────────

export interface RemoteCategory {
  name: string;
  defaultPricePerHour: number;
  defaultInternalCost?: number;
  description?: string;
  active?: boolean;
}

export interface RemoteSurcharge {
  name: string;
  type: SurchargeType;
  surchargeType: SurchargeKind;
  value: number;
  description?: string;
  active?: boolean;
}

export interface RemoteLaborRule {
  name: string;
  maxWeeklyHours: number;
  maxDailyHours: number;
  minRestBetweenShiftsH: number;
  maxConsecutiveDays: number;
  nightStartHour: number;
  nightEndHour: number;
}

export interface RemoteHoliday {
  date: string;       // YYYY-MM-DD
  name: string;
  type: HolidayType;
  autonomousCommunity?: string;
  province?: string;
  municipality?: string;
  year?: number;
  recurring?: boolean;
}

export interface RemoteUser {
  email: string;
  name: string;
  role: string;
  active?: boolean;
}

export interface RemoteAppConfig {
  companyName?: string;
  companyCif?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  ivaPercent?: string;
  maxDiscountPercent?: string;
  legalText?: string;
  defaultPaymentTerms?: string;
  calculationEngineVersion?: string;
  appMinVersion?: string;
}

export interface RemoteConfig {
  // Metadata
  _meta: {
    version: string;          // e.g. "1.0.0"
    exportedAt: string;       // ISO datetime
    exportedBy: string;       // email
    calculationEngineVersion: string;
    appMinVersion?: string;
  };

  // Data sections (all optional — only included sections are updated on import)
  categories?: RemoteCategory[];
  surcharges?: RemoteSurcharge[];
  laborRules?: RemoteLaborRule[];
  holidays?: RemoteHoliday[];
  users?: RemoteUser[];
  appConfig?: RemoteAppConfig;
}

// ─── Validation ──────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  configVersion: string;
  engineVersion?: string;
  appMinVersion?: string;
}

export const REMOTE_CONFIG_PATH = 'remote-config/gasi-config.json';

export function validateRemoteConfig(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['El archivo no contiene un objeto JSON válido.'], warnings: [], configVersion: 'unknown' };
  }

  const cfg = data as Record<string, any>;

  // Check _meta
  if (!cfg._meta || typeof cfg._meta !== 'object') {
    return { valid: false, errors: ['Falta el campo _meta obligatorio.'], warnings: [], configVersion: 'unknown' };
  }

  const meta = cfg._meta;
  const configVersion = meta.version || 'unknown';

  if (!meta.version || typeof meta.version !== 'string') {
    errors.push('Falta _meta.version (ej: "1.0.0").');
  } else {
    // Check major version compatibility
    const majorCurrent = parseInt(COST_ENGINE_VERSION.split('.')[0], 10);
    const majorRemote = parseInt(meta.version.split('.')[0], 10);
    if (majorRemote > majorCurrent) {
      errors.push(`Versión incompatible: archivo v${meta.version}, motor actual v${COST_ENGINE_VERSION}. Actualiza la aplicación antes de importar.`);
    }
  }

  if (meta.calculationEngineVersion) {
    const majorEngine = parseInt(COST_ENGINE_VERSION.split('.')[0], 10);
    const majorRemoteEngine = parseInt(meta.calculationEngineVersion.split('.')[0], 10);
    if (majorRemoteEngine > majorEngine) {
      errors.push(`Versión del motor de cálculo incompatible: archivo v${meta.calculationEngineVersion}, actual v${COST_ENGINE_VERSION}.`);
    }
  }

  if (meta.appMinVersion) {
    const majorApp = parseInt(APP_VERSION.split('.')[0], 10);
    const majorMinApp = parseInt(meta.appMinVersion.split('.')[0], 10);
    if (majorMinApp > majorApp) {
      errors.push(`Versión mínima de app requerida: v${meta.appMinVersion}. La versión actual es v${APP_VERSION}.`);
    }
  }

  // Validate categories if present
  if (cfg.categories) {
    if (!Array.isArray(cfg.categories)) {
      errors.push('categories debe ser un array.');
    } else {
      for (let i = 0; i < cfg.categories.length; i++) {
        const c = cfg.categories[i];
        if (!c.name) errors.push(`categories[${i}]: falta name.`);
        if (typeof c.defaultPricePerHour !== 'number' || c.defaultPricePerHour < 0) {
          errors.push(`categories[${i}]: defaultPricePerHour debe ser un número >= 0.`);
        }
        if (c.defaultInternalCost !== undefined && (typeof c.defaultInternalCost !== 'number' || c.defaultInternalCost < 0)) {
          errors.push(`categories[${i}]: defaultInternalCost debe ser un número >= 0.`);
        }
      }
    }
  }

  // Validate surcharges if present
  if (cfg.surcharges) {
    if (!Array.isArray(cfg.surcharges)) {
      errors.push('surcharges debe ser un array.');
    } else {
      const validTypes = [
        'nocturnidad', 'domingo', 'festivo', 'urgencia', 'dificil_cobertura',
        'desplazamiento', 'guardia_24h', 'fin_de_semana', 'municipio_especial',
        'servicio_premium', 'festivo_nacional', 'festivo_autonomico',
        'festivo_provincial', 'festivo_municipal',
      ];
      const validSurchargeTypes = ['percentage', 'fixed', 'multiplier', 'special_price'];
      for (let i = 0; i < cfg.surcharges.length; i++) {
        const s = cfg.surcharges[i];
        if (!s.name) errors.push(`surcharges[${i}]: falta name.`);
        if (!s.type || !validTypes.includes(s.type)) {
          errors.push(`surcharges[${i}]: type inválido (${s.type}). Valores: ${validTypes.join(', ')}`);
        }
        if (!s.surchargeType || !validSurchargeTypes.includes(s.surchargeType)) {
          errors.push(`surcharges[${i}]: surchargeType inválido. Valores: ${validSurchargeTypes.join(', ')}`);
        }
        if (typeof s.value !== 'number') errors.push(`surcharges[${i}]: value debe ser un número.`);
      }
    }
  }

  // Validate laborRules if present
  if (cfg.laborRules) {
    if (!Array.isArray(cfg.laborRules)) {
      errors.push('laborRules debe ser un array.');
    } else {
      for (let i = 0; i < cfg.laborRules.length; i++) {
        const r = cfg.laborRules[i];
        if (!r.name) errors.push(`laborRules[${i}]: falta name.`);
        if (typeof r.maxWeeklyHours !== 'number' || r.maxWeeklyHours <= 0) {
          errors.push(`laborRules[${i}]: maxWeeklyHours debe ser > 0.`);
        }
        if (
          typeof r.minRestBetweenShiftsH !== 'number'
          || r.minRestBetweenShiftsH < 12
        ) {
          errors.push(`laborRules[${i}]: minRestBetweenShiftsH debe ser >= 12.`);
        }
      }
    }
  }

  // Validate holidays if present
  if (cfg.holidays) {
    if (!Array.isArray(cfg.holidays)) {
      errors.push('holidays debe ser un array.');
    } else {
      const validTypes = ['nacional', 'autonomico', 'provincial', 'municipal'];
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      for (let i = 0; i < cfg.holidays.length; i++) {
        const h = cfg.holidays[i];
        if (!h.date || !dateRegex.test(h.date)) {
          errors.push(`holidays[${i}]: date debe ser YYYY-MM-DD.`);
        }
        if (!h.name) errors.push(`holidays[${i}]: falta name.`);
        if (!h.type || !validTypes.includes(h.type)) {
          errors.push(`holidays[${i}]: type inválido.`);
        }
      }
    }
  }

  // Validate users if present
  if (cfg.users) {
    if (!Array.isArray(cfg.users)) {
      errors.push('users debe ser un array.');
    } else {
      for (let i = 0; i < cfg.users.length; i++) {
        const u = cfg.users[i];
        if (!u.email) errors.push(`users[${i}]: falta email.`);
        if (!u.name) errors.push(`users[${i}]: falta name.`);
        if (!u.role) errors.push(`users[${i}]: falta role.`);
      }
    }
  }

  // Validate appConfig if present
  if (cfg.appConfig) {
    if (typeof cfg.appConfig !== 'object' || Array.isArray(cfg.appConfig)) {
      errors.push('appConfig debe ser un objeto.');
    }
    if (cfg.appConfig.ivaPercent !== undefined) {
      const iva = parseFloat(cfg.appConfig.ivaPercent);
      if (isNaN(iva) || iva < 0 || iva > 100) {
        errors.push('appConfig.ivaPercent debe ser un número entre 0 y 100.');
      }
    }
    if (cfg.appConfig.maxDiscountPercent !== undefined) {
      const maxDisc = parseFloat(cfg.appConfig.maxDiscountPercent);
      if (isNaN(maxDisc) || maxDisc < 0 || maxDisc > 100) {
        errors.push('appConfig.maxDiscountPercent debe ser un número entre 0 y 100.');
      }
    }
  }

  // Warnings
  if (!cfg.categories && !cfg.surcharges && !cfg.laborRules && !cfg.holidays && !cfg.users && !cfg.appConfig) {
    warnings.push('El archivo no contiene ninguna sección de datos. No se aplicarán cambios.');
  }

  if (cfg._meta.exportedAt) {
    try {
      const exportDate = new Date(cfg._meta.exportedAt);
      if (isNaN(exportDate.getTime())) {
        warnings.push('_meta.exportedAt no es una fecha ISO válida.');
      }
    } catch {
      warnings.push('_meta.exportedAt no es una fecha ISO válida.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    configVersion,
    engineVersion: meta.calculationEngineVersion,
    appMinVersion: meta.appMinVersion,
  };
}

// ─── Export: DB → RemoteConfig ──────────────────────────────

export async function buildRemoteConfig(exportedBy: string): Promise<RemoteConfig> {
  const { db } = await import('./db');

  const [categories, surcharges, laborRules, holidays, appConfigs] = await Promise.all([
    db.professionalCategory.findMany({ orderBy: { name: 'asc' } }),
    db.surchargeConfig.findMany({ orderBy: { name: 'asc' } }),
    db.laborRule.findMany({ orderBy: { name: 'asc' } }),
    db.holiday.findMany({ orderBy: { date: 'asc' } }),
    db.appConfig.findMany(),
  ]);

  const appConfig: RemoteAppConfig = {};
  for (const c of appConfigs) {
    (appConfig as any)[c.key] = c.value;
  }

  // La versión del motor y de la app son fuentes fijas del código, no
  // configurables desde base de datos: así el desfase no puede reaparecer
  // en instalaciones ya sembradas.
  const engineVersion = COST_ENGINE_VERSION;
  const appVersion = APP_VERSION;

  const remoteCategories: RemoteCategory[] = categories.map(c => ({
    name: c.name,
    defaultPricePerHour: c.defaultPricePerHour,
    defaultInternalCost: c.defaultInternalCost ?? undefined,
    description: c.description ?? undefined,
    active: c.active,
  }));

  const remoteSurcharges: RemoteSurcharge[] = surcharges.map(s => ({
    name: s.name,
    type: s.type as SurchargeType,
    surchargeType: s.surchargeType as SurchargeKind,
    value: s.value,
    description: s.description ?? undefined,
    active: s.active,
  }));

  const remoteLaborRules: RemoteLaborRule[] = laborRules.map(r => ({
    name: r.name,
    maxWeeklyHours: r.maxWeeklyHours,
    maxDailyHours: r.maxDailyHours,
    minRestBetweenShiftsH: r.minRestBetweenShiftsH,
    maxConsecutiveDays: r.maxConsecutiveDays,
    nightStartHour: r.nightStartHour,
    nightEndHour: r.nightEndHour,
  }));

  const remoteHolidays: RemoteHoliday[] = holidays.map(h => ({
    date: h.date,
    name: h.name,
    type: h.type as HolidayType,
    autonomousCommunity: h.autonomousCommunity ?? undefined,
    province: h.province ?? undefined,
    municipality: h.municipality ?? undefined,
    year: h.year ?? undefined,
    recurring: h.recurring,
  }));

  return {
    _meta: {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      exportedBy,
      calculationEngineVersion: engineVersion,
      appMinVersion: appVersion,
    },
    categories: remoteCategories,
    surcharges: remoteSurcharges,
    laborRules: remoteLaborRules,
    holidays: remoteHolidays,
    appConfig,
  };
}

// ─── Import: RemoteConfig → DB ──────────────────────────────

export interface ImportResult {
  success: boolean;
  changesApplied: {
    categories?: number;
    surcharges?: number;
    laborRules?: number;
    holidays?: number;
    users?: number;
    appConfig?: number;
  };
  errors: string[];
}

export async function applyRemoteConfig(config: RemoteConfig): Promise<ImportResult> {
  const { db } = await import('./db');
  const changesApplied: ImportResult['changesApplied'] = {};
  const errors: string[] = [];

  try {
    // ── Categories: upsert by name ──
    if (config.categories && config.categories.length > 0) {
      let count = 0;
      for (const rc of config.categories) {
        try {
          await db.professionalCategory.upsert({
            where: { name: rc.name },
            update: {
              defaultPricePerHour: rc.defaultPricePerHour,
              defaultInternalCost: rc.defaultInternalCost ?? null,
              description: rc.description ?? null,
              active: rc.active ?? true,
            },
            create: {
              name: rc.name,
              defaultPricePerHour: rc.defaultPricePerHour,
              defaultInternalCost: rc.defaultInternalCost ?? null,
              description: rc.description ?? null,
              active: rc.active ?? true,
            },
          });
          count++;
        } catch (e: any) {
          errors.push(`Categoría "${rc.name}": ${e.message}`);
        }
      }
      changesApplied.categories = count;
    }

    // ── Surcharges: upsert by name ──
    if (config.surcharges && config.surcharges.length > 0) {
      let count = 0;
      for (const rs of config.surcharges) {
        try {
          await db.surchargeConfig.upsert({
            where: { name: rs.name },
            update: {
              type: rs.type,
              surchargeType: rs.surchargeType,
              value: rs.value,
              description: rs.description ?? null,
              active: rs.active ?? true,
            },
            create: {
              name: rs.name,
              type: rs.type,
              surchargeType: rs.surchargeType,
              value: rs.value,
              description: rs.description ?? null,
              active: rs.active ?? true,
            },
          });
          count++;
        } catch (e: any) {
          errors.push(`Recargo "${rs.name}": ${e.message}`);
        }
      }
      changesApplied.surcharges = count;
    }

    // ── Labor Rules: upsert by name ──
    if (config.laborRules && config.laborRules.length > 0) {
      let count = 0;
      for (const rl of config.laborRules) {
        try {
          await db.laborRule.upsert({
            where: { name: rl.name },
            update: {
              maxWeeklyHours: rl.maxWeeklyHours,
              maxDailyHours: rl.maxDailyHours,
              minRestBetweenShiftsH: rl.minRestBetweenShiftsH,
              maxConsecutiveDays: rl.maxConsecutiveDays,
              nightStartHour: rl.nightStartHour,
              nightEndHour: rl.nightEndHour,
            },
            create: {
              name: rl.name,
              maxWeeklyHours: rl.maxWeeklyHours,
              maxDailyHours: rl.maxDailyHours,
              minRestBetweenShiftsH: rl.minRestBetweenShiftsH,
              maxConsecutiveDays: rl.maxConsecutiveDays,
              nightStartHour: rl.nightStartHour,
              nightEndHour: rl.nightEndHour,
            },
          });
          count++;
        } catch (e: any) {
          errors.push(`Regla laboral "${rl.name}": ${e.message}`);
        }
      }
      changesApplied.laborRules = count;
    }

    // ── Holidays: delete existing, recreate (full replace) ──
    if (config.holidays && config.holidays.length > 0) {
      try {
        await db.holiday.deleteMany({});
        await db.holiday.createMany({
          data: config.holidays.map(h => ({
            date: h.date,
            name: h.name,
            type: h.type,
            autonomousCommunity: h.autonomousCommunity ?? null,
            province: h.province ?? null,
            municipality: h.municipality ?? null,
            year: h.year ?? null,
            recurring: h.recurring ?? true,
          })),
        });
        changesApplied.holidays = config.holidays.length;
      } catch (e: any) {
        errors.push(`Festivos: ${e.message}`);
      }
    }

    // ── Users: upsert by email ──
    if (config.users && config.users.length > 0) {
      let count = 0;
      for (const ru of config.users) {
        try {
          await db.user.upsert({
            where: { email: ru.email },
            update: {
              name: ru.name,
              role: ru.role,
              active: ru.active ?? true,
            },
            create: {
              email: ru.email,
              name: ru.name,
              role: ru.role,
              active: ru.active ?? true,
            },
          });
          count++;
        } catch (e: any) {
          errors.push(`Usuario "${ru.email}": ${e.message}`);
        }
      }
      changesApplied.users = count;
    }

    // ── App Config: upsert each key ──
    if (config.appConfig) {
      let count = 0;
      const skipKeys = new Set(['_meta']);
      for (const [key, value] of Object.entries(config.appConfig)) {
        if (skipKeys.has(key)) continue;
        if (value === undefined || value === null) continue;
        try {
          await db.appConfig.upsert({
            where: { key },
            update: { value: String(value) },
            create: { key, value: String(value) },
          });
          count++;
        } catch (e: any) {
          errors.push(`Config "${key}": ${e.message}`);
        }
      }
      changesApplied.appConfig = count;
    }
  } catch (e: any) {
    errors.push(`Error general durante la importación: ${e.message}`);
  }

  return {
    success: errors.length === 0,
    changesApplied,
    errors,
  };
}

// ─── File System Helpers ────────────────────────────────────

import { readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { dataRoot } from './data-paths';

export function getRemoteConfigPath(): string {
  return join(dataRoot(), REMOTE_CONFIG_PATH);
}

export async function readRemoteConfigFile(): Promise<{ data: RemoteConfig | null; mtime: Date | null; error: string | null }> {
  const filePath = getRemoteConfigPath();
  try {
    const fileStat = await stat(filePath);
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return { data: parsed, mtime: fileStat.mtime, error: null };
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return { data: null, mtime: null, error: 'No existe el archivo de configuración remota.' };
    }
    if (e instanceof SyntaxError) {
      return { data: null, mtime: null, error: 'El archivo JSON está corrupto o no es JSON válido.' };
    }
    return { data: null, mtime: null, error: e.message };
  }
}

export async function writeRemoteConfigFile(config: RemoteConfig): Promise<void> {
  const filePath = getRemoteConfigPath();
  const content = JSON.stringify(config, null, 2);
  await writeFile(filePath, content, 'utf-8');
}

export async function checkForNewConfig(): Promise<{
  hasNewConfig: boolean;
  configVersion: string;
  exportedAt: string;
  exportedBy: string;
  localLastImport?: string;
}> {
  const { data, mtime, error } = await readRemoteConfigFile();
  if (error || !data || !mtime) {
    return { hasNewConfig: false, configVersion: '', exportedAt: '', exportedBy: '' };
  }

  // Check the last import audit log
  const { db } = await import('./db');
  const lastImport = await db.configAuditLog.findFirst({
    where: { action: 'import', result: 'success' },
    orderBy: { createdAt: 'desc' },
  });

  // If file was modified after last import, it's new
  const hasNewConfig = !lastImport || mtime > lastImport.createdAt;

  return {
    hasNewConfig,
    configVersion: data._meta?.version || 'unknown',
    exportedAt: data._meta?.exportedAt || '',
    exportedBy: data._meta?.exportedBy || '',
    localLastImport: lastImport?.createdAt.toISOString(),
  };
}

// ─── Audit Logging ──────────────────────────────────────────

export async function logConfigAudit(params: {
  action: string;
  userEmail?: string;
  userName?: string;
  role?: string;
  oldVersion?: string;
  newVersion?: string;
  changesApplied?: Record<string, number>;
  fileSource?: string;
  result: string;
  errorMessage?: string;
}): Promise<void> {
  const { db } = await import('./db');
  await db.configAuditLog.create({
    data: {
      action: params.action,
      userEmail: params.userEmail ?? null,
      userName: params.userName ?? null,
      role: params.role ?? null,
      oldVersion: params.oldVersion ?? null,
      newVersion: params.newVersion ?? null,
      changesApplied: params.changesApplied ? JSON.stringify(params.changesApplied) : null,
      fileSource: params.fileSource ?? null,
      result: params.result,
      errorMessage: params.errorMessage ?? null,
    },
  });
}
