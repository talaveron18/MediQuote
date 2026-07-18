import type { BudgetInput, ServiceBlockInput } from '@/lib/types';

export const LEGAL_DISCLAIMER = 'La información fiscal, jurídica y normativa proporcionada por la IA es orientativa. Comprueba siempre las fuentes oficiales y valida las decisiones relevantes con un profesional cualificado.';
export const EXTERNAL_SOURCE_DISCLAIMER = 'Información consultada en fuentes externas. Verifica su vigencia y aplicación concreta antes de actuar.';

export type AiBudgetPatch = {
  budget?: Partial<BudgetInput>;
  /** Compatibilidad con integraciones anteriores: primer bloque detectado. */
  block?: Partial<ServiceBlockInput>;
  /** Lista completa de servicios/turnos solicitados. */
  blocks?: Partial<ServiceBlockInput>[];
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

const CATEGORY_DEFINITIONS = [
  { nouns: 'm[eé]dic[oa]s?|facultativ[oa]s?', category: 'Médico/a' },
  { nouns: 'enfermer[oa]s?|dues?', category: 'Enfermero/a' },
  { nouns: 'auxiliares?(?:\\s+de\\s+enfermer[ií]a)?|tcaes?', category: 'TCAE' },
  { nouns: 'fisioterapeutas?|fisios?', category: 'Fisioterapeuta' },
] as const;

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11,
  doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  dieciséis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
};

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
  return {
    dateRangeStart: isoDate(year, months[0], 1),
    dateRangeEnd: isoDate(year, months[months.length - 1] + 1, 0),
  };
}

function quantityFrom(raw?: string): number {
  if (!raw) return 1;
  const normalized = raw.toLocaleLowerCase('es-ES');
  return Math.max(1, Number(raw) || NUMBER_WORDS[normalized] || 1);
}

function extractServices(text: string): Array<{ category: string; quantity: number }> {
  const services: Array<{ category: string; quantity: number }> = [];
  const quantity = '(\\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte)';
  for (const definition of CATEGORY_DEFINITIONS) {
    const expression = new RegExp(`\\b(?:${quantity}\\s+)?(?:${definition.nouns})\\b`, 'gi');
    for (const match of text.matchAll(expression)) {
      services.push({ category: definition.category, quantity: quantityFrom(match[1]) });
    }
  }
  return services;
}

function extractTurns(text: string): Array<NonNullable<ServiceBlockInput['shiftType']>> {
  if (/\b24\s*h(?:oras?)?\b/i.test(text)) return ['24h'];
  const turns: Array<NonNullable<ServiceBlockInput['shiftType']>> = [];
  if (/\bma[ñn]ana\b/i.test(text)) turns.push('morning');
  if (/\btarde\b/i.test(text)) turns.push('afternoon');
  if (/\bnocturn[oa]|\bnoche\b/i.test(text)) turns.push('night');
  return turns;
}

const TURN_LABELS: Record<string, string> = {
  morning: 'mañana',
  afternoon: 'tarde',
  night: 'noche',
  '24h': '24 horas',
  custom: 'personalizado',
};

export function extractBudgetPatch(text: string): AiBudgetPatch {
  const budget: Partial<BudgetInput> = {};
  const common: Partial<ServiceBlockInput> = {};

  if (/\blunes\s+a\s+viernes\b|\bl\s*[-–]\s*v\b/i.test(text)) common.daysOfWeek = [1, 2, 3, 4, 5];
  else {
    const days: Array<[RegExp, number]> = [[/lunes/i, 1], [/martes/i, 2], [/mi[eé]rcoles/i, 3], [/jueves/i, 4], [/viernes/i, 5], [/s[aá]bado/i, 6], [/domingo/i, 0]];
    const found = days.filter(([pattern]) => pattern.test(text)).map(([, day]) => day);
    if (found.length) common.daysOfWeek = found;
  }

  const hours = text.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*h(?:oras?)?\b/i);
  if (hours && !/\b24\s*h/i.test(hours[0])) common.hoursPerDay = Number(hours[1].replace(',', '.'));
  if (/\bindefinid[oa]\b/i.test(text)) common.contractType = 'indefinido';
  else if (/\bfijo\s+discontinuo\b/i.test(text)) common.contractType = 'fijo_discontinuo';
  else if (/\btemporal\b/i.test(text)) common.contractType = 'temporal';
  Object.assign(common, extractDateRange(text));

  const services = extractServices(text);
  const turns = extractTurns(text);
  let blocks: Partial<ServiceBlockInput>[] = services.flatMap((service) => {
    const requestedTurns = turns.length ? turns : [undefined];
    return requestedTurns.map((turn) => ({
      ...common,
      professionalCategory: service.category,
      serviceName: `Servicio de ${service.category}${turn ? ` · ${TURN_LABELS[turn]}` : ''}`,
      puestosSimultaneos: service.quantity,
      ...(turn ? { shiftType: turn } : {}),
    }));
  });

  if (!blocks.length && Object.keys(common).length) blocks = [{ ...common }];
  if (blocks.length === 1 && services.length === 1 && services[0].quantity === 1) {
    const genericProfessionals = text.match(/\b(\d+)\s+profesionales?\b/i);
    if (genericProfessionals) blocks[0].puestosSimultaneos = Math.max(1, Number(genericProfessionals[1]));
  }

  if (/castilla[- ]la mancha|\bclm\b/i.test(text)) budget.serviceAutonomousCommunity = 'Castilla-La Mancha';
  else if (/castilla y le[oó]n|\bcyl\b/i.test(text)) budget.serviceAutonomousCommunity = 'Castilla y León';
  else if (/\bmadrid\b/i.test(text)) budget.serviceAutonomousCommunity = 'Madrid';

  for (const [province, community] of Object.entries(PROVINCE_COMMUNITY)) {
    const normalized = province
      .replace(/[ÁáA]/g, '[ÁáA]')
      .replace(/[ÉéE]/g, '[ÉéE]')
      .replace(/[ÓóO]/g, '[ÓóO]');
    if (new RegExp(`\\b${normalized}\\b`, 'i').test(text)) {
      budget.serviceAutonomousCommunity = community;
      budget.serviceProvince = province;
      budget.serviceMunicipality = province;
      break;
    }
  }

  const questions: string[] = [];
  if (!services.length) questions.push('¿Qué categorías profesionales y cuántas personas necesita?');
  else if (!budget.serviceAutonomousCommunity) questions.push('¿En qué comunidad, provincia y municipio se prestará el servicio?');
  else if (!budget.serviceProvince || !budget.serviceMunicipality) questions.push('¿En qué provincia y municipio concreto se prestará?');
  else if (!common.dateRangeStart || !common.dateRangeEnd) questions.push('¿Entre qué fechas se prestará el servicio?');
  else if (!turns.length && !common.hoursPerDay) questions.push('¿Qué turno y duración diaria tendrá cada servicio?');

  const lines = blocks
    .filter((block) => block.professionalCategory)
    .map((block) => `• ${block.puestosSimultaneos ?? 1} × ${block.professionalCategory} — ${TURN_LABELS[String(block.shiftType)] || 'turno por confirmar'}`);

  return {
    budget,
    block: blocks[0],
    blocks,
    summary: lines.length
      ? `He preparado ${lines.length} bloque(s) de servicio:\n${lines.join('\n')}\nRevísalos en el formulario; cualquier cambio manual tendrá prioridad.`
      : Object.keys(common).length || Object.keys(budget).length
        ? 'He conservado los datos operativos identificados, pero falta concretar los profesionales.'
        : 'Todavía no hay datos suficientes para preparar el servicio.',
    questions: questions.slice(0, 1),
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
