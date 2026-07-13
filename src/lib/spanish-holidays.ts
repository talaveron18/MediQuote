// ─── Festivos de España — Datos de ejemplo ───────────────────────
import type { HolidayInfo, HolidayType } from './types';

// Festivos nacionales fijos: recurrentes por mes-día.
// Los festivos móviles (Semana Santa) NO deben ser recurrentes.
const NACIONALES: { month: number; day: number; name: string; recurring: true }[] = [
  { month: 1, day: 1, name: 'Año Nuevo', recurring: true },
  { month: 1, day: 6, name: 'Reyes Magos', recurring: true },
  { month: 5, day: 1, name: 'Día del Trabajador', recurring: true },
  { month: 8, day: 15, name: 'Asunción de la Virgen', recurring: true },
  { month: 10, day: 12, name: 'Fiesta Nacional de España', recurring: true },
  { month: 11, day: 1, name: 'Todos los Santos', recurring: true },
  { month: 12, day: 6, name: 'Día de la Constitución', recurring: true },
  { month: 12, day: 8, name: 'Inmaculada Concepción', recurring: true },
  { month: 12, day: 25, name: 'Navidad', recurring: true },
];

// Festivos autonómicos/locales de ejemplo.
// Importante: NO se incluyen en el seed global. Solo se devuelven si se pide una localización explícita.
const AUTONOMICOS: { month: number; day: number; name: string; cc: string }[] = [
  { month: 5, day: 2, name: 'Día de la Comunidad de Madrid', cc: 'Madrid' },
  { month: 5, day: 15, name: 'San Isidro Labrador', cc: 'Madrid' },
  { month: 11, day: 9, name: 'Almudena', cc: 'Madrid' },
  // Cataluña se mantiene solo como dato de ejemplo localizable, nunca en el seed GASI por defecto.
  { month: 6, day: 24, name: 'Sant Joan', cc: 'Cataluña' },
  { month: 9, day: 11, name: 'Diada Nacional de Catalunya', cc: 'Cataluña' },
  // Andalucía
  { month: 2, day: 28, name: 'Día de Andalucía', cc: 'Andalucía' },
  // Valencia
  { month: 10, day: 9, name: 'Comunidad Valenciana', cc: 'Valencia' },
  // País Vasco
  { month: 10, day: 25, name: 'Euskadi Eguna', cc: 'País Vasco' },
  // Galicia
  { month: 5, day: 17, name: 'Día das Letras Galegas', cc: 'Galicia' },
];

// Festivos provinciales de ejemplo.
// Tampoco se incluyen sin provincia explícita.
const PROVINCIALES: { month: number; day: number; name: string; province: string }[] = [
  { month: 6, day: 29, name: 'San Pedro', province: 'Madrid' },
];

// Generar festivos para un año específico.
// Sin localización: solo nacionales. Esto evita que festivos autonómicos no operativos
// (p. ej. Cataluña) contaminen presupuestos de GASI.
export function generateHolidaysForYear(year: number, location?: { cc?: string; province?: string }): HolidayInfo[] {
  const holidays: HolidayInfo[] = [];

  // Nacionales fijos: recurrentes y aplican a todos.
  for (const h of NACIONALES) {
    const mm = String(h.month).padStart(2, '0');
    const dd = String(h.day).padStart(2, '0');
    holidays.push({
      date: `${year}-${mm}-${dd}`,
      name: h.name,
      type: 'nacional',
      recurring: true,
    });
  }

  // Autonómicos: solo con comunidad explícita.
  if (location?.cc) {
    for (const h of AUTONOMICOS) {
      if (location.cc !== h.cc) continue;
      const mm = String(h.month).padStart(2, '0');
      const dd = String(h.day).padStart(2, '0');
      holidays.push({
        date: `${year}-${mm}-${dd}`,
        name: h.name,
        type: 'autonomico',
        autonomousCommunity: h.cc,
        recurring: false,
      });
    }
  }

  // Provinciales: solo con provincia explícita.
  if (location?.province) {
    for (const h of PROVINCIALES) {
      if (location.province !== h.province) continue;
      const mm = String(h.month).padStart(2, '0');
      const dd = String(h.day).padStart(2, '0');
      holidays.push({
        date: `${year}-${mm}-${dd}`,
        name: h.name,
        type: 'provincial',
        province: h.province,
        recurring: false,
      });
    }
  }

  // Jueves Santo y Viernes Santo (Semana Santa — variable)
  // Easter calculation (simplified — uses current year's known dates)
  // 2026: Jueves Santo = April 2, Viernes Santo = April 3
  // We'll add a simple approximation
  const easter = computeEaster(year);
  const juevesSanto = new Date(easter);
  juevesSanto.setDate(juevesSanto.getDate() - 3);
  const viernesSanto = new Date(easter);
  viernesSanto.setDate(viernesSanto.getDate() - 2);

  holidays.push({
    date: formatDate(juevesSanto),
    name: 'Jueves Santo',
    type: 'nacional',
    recurring: false,
  });
  holidays.push({
    date: formatDate(viernesSanto),
    name: 'Viernes Santo',
    type: 'nacional',
    recurring: false,
  });

  return holidays;
}

function computeEaster(year: number): Date {
  // Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 100;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Generar datos para el seed (rango de años).
// Sin localización explícita, solo nacionales.
export function generateSeedHolidays(startYear: number = 2025, endYear: number = 2027): HolidayInfo[] {
  const all: HolidayInfo[] = [];
  for (let y = startYear; y <= endYear; y++) {
    all.push(...generateHolidaysForYear(y));
  }
  return all;
}

// Get holidays for DB seed: GASI no debe cargar festivos autonómicos/locales de territorios
// no operativos como Cataluña. Los locales se añadirán por ubicación cuando exista filtro geográfico.
export function getHolidaysForDBSeed(): {
  date: string; name: string; type: HolidayType;
  autonomousCommunity?: string; province?: string;
  recurring?: boolean;
}[] {
  const all = generateSeedHolidays(2025, 2028);
  return all.map(h => ({
    date: h.date,
    name: h.name,
    type: h.type,
    autonomousCommunity: h.autonomousCommunity,
    province: h.province,
    recurring: h.recurring ?? false,
  }));
}
