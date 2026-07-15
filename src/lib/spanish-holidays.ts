import type { HolidayInfo, HolidayType } from './types';

type HolidaySeed = Omit<HolidayInfo, 'date'> & { month: number; day: number };
type HolidayLocation = { cc?: string; province?: string; municipality?: string };

const FIXED_NATIONAL: HolidaySeed[] = [
  { month: 1, day: 1, name: 'Año Nuevo', type: 'nacional', recurring: true },
  { month: 1, day: 6, name: 'Epifanía del Señor', type: 'nacional', recurring: true },
  { month: 5, day: 1, name: 'Fiesta del Trabajo', type: 'nacional', recurring: true },
  { month: 8, day: 15, name: 'Asunción de la Virgen', type: 'nacional', recurring: true },
  { month: 10, day: 12, name: 'Fiesta Nacional de España', type: 'nacional', recurring: true },
  { month: 12, day: 8, name: 'Inmaculada Concepción', type: 'nacional', recurring: true },
  { month: 12, day: 25, name: 'Navidad', type: 'nacional', recurring: true },
];

const REGIONAL_2026: Record<string, HolidaySeed[]> = {
  Madrid: [
    { month: 4, day: 2, name: 'Jueves Santo', type: 'autonomico' },
    { month: 4, day: 3, name: 'Viernes Santo', type: 'autonomico' },
    { month: 5, day: 2, name: 'Fiesta de la Comunidad de Madrid', type: 'autonomico' },
    { month: 11, day: 2, name: 'Traslado de Todos los Santos', type: 'autonomico' },
    { month: 12, day: 7, name: 'Traslado del Día de la Constitución', type: 'autonomico' },
  ],
  'Castilla y León': [
    { month: 4, day: 2, name: 'Jueves Santo', type: 'autonomico' },
    { month: 4, day: 3, name: 'Viernes Santo', type: 'autonomico' },
    { month: 4, day: 23, name: 'Fiesta de Castilla y León', type: 'autonomico' },
    { month: 11, day: 2, name: 'Traslado de Todos los Santos', type: 'autonomico' },
    { month: 12, day: 7, name: 'Traslado del Día de la Constitución', type: 'autonomico' },
  ],
  'Castilla-La Mancha': [
    { month: 4, day: 2, name: 'Jueves Santo', type: 'autonomico' },
    { month: 4, day: 3, name: 'Viernes Santo', type: 'autonomico' },
    { month: 4, day: 6, name: 'Lunes de Pascua', type: 'autonomico' },
    { month: 6, day: 4, name: 'Corpus Christi', type: 'autonomico' },
    { month: 11, day: 2, name: 'Traslado de Todos los Santos', type: 'autonomico' },
  ],
};

const MUNICIPAL_2026: Record<string, HolidaySeed[]> = {
  Madrid: [
    { month: 5, day: 15, name: 'San Isidro Labrador', type: 'municipal', municipality: 'Madrid' },
    { month: 11, day: 9, name: 'Nuestra Señora de la Almudena', type: 'municipal', municipality: 'Madrid' },
  ],
  Burgos: [
    { month: 6, day: 12, name: 'El Curpillos', type: 'municipal', municipality: 'Burgos' },
    { month: 6, day: 29, name: 'San Pedro y San Pablo', type: 'municipal', municipality: 'Burgos' },
  ],
};

function toHoliday(year: number, item: HolidaySeed, location?: HolidayLocation): HolidayInfo {
  return {
    date: `${year}-${String(item.month).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`,
    name: item.name,
    type: item.type,
    autonomousCommunity: item.autonomousCommunity ?? (item.type === 'autonomico' ? location?.cc : undefined),
    province: item.province,
    municipality: item.municipality,
    recurring: item.recurring ?? false,
  };
}

function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function generateHolidaysForYear(year: number, location?: HolidayLocation): HolidayInfo[] {
  const result = FIXED_NATIONAL.map((holiday) => toHoliday(year, holiday, location));

  if (year === 2026 && location?.cc && REGIONAL_2026[location.cc]) {
    result.push(...REGIONAL_2026[location.cc].map((holiday) => toHoliday(year, holiday, location)));
  } else {
    const easter = computeEaster(year);
    const thursday = new Date(easter);
    thursday.setDate(thursday.getDate() - 3);
    const friday = new Date(easter);
    friday.setDate(friday.getDate() - 2);
    result.push(
      { date: formatDate(thursday), name: 'Jueves Santo', type: location?.cc ? 'autonomico' : 'nacional', autonomousCommunity: location?.cc, recurring: false },
      { date: formatDate(friday), name: 'Viernes Santo', type: location?.cc ? 'autonomico' : 'nacional', autonomousCommunity: location?.cc, recurring: false },
    );
  }

  if (year === 2026 && location?.municipality && MUNICIPAL_2026[location.municipality]) {
    result.push(...MUNICIPAL_2026[location.municipality].map((holiday) => toHoliday(year, holiday, location)));
  }

  return [...new Map(result.map((holiday) => [holiday.date, holiday])).values()]
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function generateSeedHolidays(startYear = 2025, endYear = 2028): HolidayInfo[] {
  const all: HolidayInfo[] = [];
  for (let year = startYear; year <= endYear; year++) all.push(...generateHolidaysForYear(year));
  return all;
}

export function getHolidaysForDBSeed(): {
  date: string; name: string; type: HolidayType;
  autonomousCommunity?: string; province?: string; municipality?: string;
  recurring?: boolean;
}[] {
  return generateSeedHolidays().map((holiday) => ({ ...holiday }));
}
