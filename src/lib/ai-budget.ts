import type { BudgetInput, ServiceBlockInput } from '@/lib/types';

export const LEGAL_DISCLAIMER = 'La información fiscal, jurídica y normativa proporcionada por la IA es orientativa. Comprueba siempre las fuentes oficiales y valida las decisiones relevantes con un profesional cualificado.';
export const EXTERNAL_SOURCE_DISCLAIMER = 'Información consultada en fuentes externas. Verifica su vigencia y aplicación concreta antes de actuar.';

export type AiBudgetPatch = {
  budget?: Partial<BudgetInput>;
  block?: Partial<ServiceBlockInput>;
  summary: string;
  questions: string[];
};

export type NormativeSource = {
  title: string;
  organization: string;
  publishedAt?: string;
  consultedAt: string;
  relevantSection?: string;
  url: string;
};

export type AiBudgetReply = {
  kind: 'budget' | 'normative';
  text: string;
  patch?: AiBudgetPatch;
  sources?: NormativeSource[];
  uncertainty?: string;
};

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(m[eé]dic[oa]|facultativ[oa])s?\b/i, 'Médico/a'],
  [/\b(enfermer[oa]|due)s?\b/i, 'Enfermero/a'],
  [/\b(auxiliar(?:es)?(?:\s+de\s+enfermer[ií]a)?|tcae)s?\b/i, 'TCAE'],
  [/\b(fisioterapeuta)s?\b/i, 'Fisioterapeuta'],
];

const PROVINCE_COMMUNITY: Record<string, string> = {
  Madrid: 'Madrid', 'Ávila': 'Castilla y León', Burgos: 'Castilla y León', León: 'Castilla y León',
  Palencia: 'Castilla y León', Salamanca: 'Castilla y León', Segovia: 'Castilla y León', Soria: 'Castilla y León',
  Valladolid: 'Castilla y León', Zamora: 'Castilla y León', Albacete: 'Castilla-La Mancha',
  'Ciudad Real': 'Castilla-La Mancha', Cuenca: 'Castilla-La Mancha', Guadalajara: 'Castilla-La Mancha', Toledo: 'Castilla-La Mancha',
};

export function looksNormative(text: string): boolean {
  return /\b(boe|convenio|laboral|fiscal|iva|cotizaci[oó]n|seguridad social|contrataci[oó]n|facturaci[oó]n|prevenci[oó]n|protecci[oó]n de datos|normativa|ley|decreto|inspecci[oó]n|sepe|hacienda)\b/i.test(text)
    && /\b(qu[eé]|cu[aá]l|c[oó]mo|puedo|debo|aplica|obligaci[oó]n|plazo|tipo|norma)\b/i.test(text);
}

function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function extractDateRange(text: string): Pick<ServiceBlockInput, 'dateRangeStart' | 'dateRangeEnd'> {
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear();
  const mentioned = Object.entries(MONTHS).filter(([name]) => new RegExp(`\\b${name}\\b`, 'i').test(text));
  if (!mentioned.length) return {};
  const months = mentioned.map(([, value]) => value).sort((a, b) => a - b);
  const first = months[0];
  const last = months[months.length - 1];
  return {
    dateRangeStart: isoDate(year, first, 1),
    dateRangeEnd: isoDate(year, last + 1, 0),
  };
}

export function extractBudgetPatch(text: string): AiBudgetPatch {
  const block: Partial<ServiceBlockInput> = {};
  const budget: Partial<BudgetInput> = {};
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) { block.professionalCategory = category; block.serviceName = `Servicio de ${category}`; break; }
  }
  if (/\blunes\s+a\s+viernes\b|\bl\s*[-–]\s*v\b/i.test(text)) block.daysOfWeek = [1, 2, 3, 4, 5];
  else {
    const days: Array<[RegExp, number]> = [[/lunes/i,1],[/martes/i,2],[/mi[eé]rcoles/i,3],[/jueves/i,4],[/viernes/i,5],[/s[aá]bado/i,6],[/domingo/i,0]];
    const found = days.filter(([p]) => p.test(text)).map(([, d]) => d);
    if (found.length) block.daysOfWeek = found;
  }
  const hours = text.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*h(?:oras?)?\b/i);
  if (hours) block.hoursPerDay = Number(hours[1].replace(',', '.'));
  if (/\b24\s*h/i.test(text)) block.shiftType = '24h';
  else if (/\bnocturn[oa]|\bnoche\b/i.test(text)) block.shiftType = 'night';
  else if (/\btarde\b/i.test(text)) block.shiftType = 'afternoon';
  else if (/\bma[ñn]ana\b/i.test(text)) block.shiftType = 'morning';
  const professionals = text.match(/\b(\d+)\s+(?:profesionales?|m[eé]dicos?|enfermer[oa]s?|tcae)\b/i);
  if (professionals) block.puestosSimultaneos = Math.max(1, Number(professionals[1]));
  if (/\bindefinid[oa]\b/i.test(text)) block.contractType = 'indefinido';
  else if (/\bfijo\s+discontinuo\b/i.test(text)) block.contractType = 'fijo_discontinuo';
  else if (/\btemporal\b/i.test(text)) block.contractType = 'temporal';
  Object.assign(block, extractDateRange(text));
  if (/castilla[- ]la mancha|\bclm\b/i.test(text)) budget.serviceAutonomousCommunity = 'Castilla-La Mancha';
  else if (/castilla y le[oó]n|\bcyl\b/i.test(text)) budget.serviceAutonomousCommunity = 'Castilla y León';
  else if (/\bmadrid\b/i.test(text)) budget.serviceAutonomousCommunity = 'Madrid';
  for (const [province, community] of Object.entries(PROVINCE_COMMUNITY)) {
    const normalized = province.replace('Á', '[ÁAáa]').replace('ó', '[óo]');
    if (new RegExp(`\\b${normalized}\\b`, 'i').test(text)) {
      budget.serviceAutonomousCommunity = community;
      budget.serviceProvince = province;
      // Si se nombra la capital provincial, puede resolverse como municipio exacto.
      budget.serviceMunicipality = province;
      break;
    }
  }
  const questions: string[] = [];
  if (!block.professionalCategory) questions.push('¿Qué categoría profesional necesita?');
  if (!block.dateRangeStart || !block.dateRangeEnd) questions.push('¿Entre qué fechas se prestará el servicio?');
  if (!block.hoursPerDay) questions.push('¿Cuántas horas dura cada turno?');
  if (!budget.serviceAutonomousCommunity) questions.push('¿En qué comunidad, provincia y municipio se prestará?');
  else if (!budget.serviceProvince || !budget.serviceMunicipality) questions.push('¿En qué provincia y municipio concreto se prestará?');
  return {
    budget,
    block,
    summary: Object.keys(block).length || Object.keys(budget).length
      ? 'He preparado los datos operativos identificados. Revísalos en el formulario; cualquier cambio manual tendrá prioridad.'
      : 'Todavía no hay datos suficientes para preparar el servicio.',
    questions: questions.slice(0, 2),
  };
}

export function mergeWithoutOverwriting<T extends object>(current: T, patch: Partial<T>, protectedFields: Set<keyof T>): T {
  const result = { ...current };
  for (const [key, value] of Object.entries(patch) as [keyof T, T[keyof T]][]) {
    if (value !== undefined && !protectedFields.has(key)) result[key] = value;
  }
  return result;
}

export function findManualChanges<T extends object>(current: T, lastAiApplied: Partial<T>): Set<keyof T> {
  const protectedFields = new Set<keyof T>();
  for (const key of Object.keys(lastAiApplied) as (keyof T)[]) {
    if (JSON.stringify(current[key]) !== JSON.stringify(lastAiApplied[key])) protectedFields.add(key);
  }
  return protectedFields;
}

export function assertFiniteBudget(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(assertFiniteBudget);
  if (value && typeof value === 'object') return Object.values(value).every(assertFiniteBudget);
  return true;
}
