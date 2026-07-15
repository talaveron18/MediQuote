// ─── Motor de Cálculo de Presupuestos Sanitarios v2 ──────────
// Reglas clave:
// - puestosSimultaneos multiplica horas/precio; plantillaSeleccionada NO multiplica precio.
// - Festivos por fecha completa salvo recurring=true.
// - Recargos de día especial mutuamente excluyentes; nocturnidad compatible.
// - Bloques simples respetan ceros explícitos con ??, no ||.
// - Plantilla mínima en calculateServiceBlock usa horas reales de turno.
// - Turnos que cruzan medianoche reparten festivo/domingo/fin de semana por fecha real.

import type {
  DateConfig, ShiftConfig, ShiftHourBreakdown, HolidayInfo,
  LaborWarning, SurchargeEntry, SurchargeType, SurchargeKind,
  BlockCalculationResult, HolidayType, WeeklyHoursEntry,
} from './types';

// ─── Helpers ─────────────────────────────────────────────────────

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseHHMM(timeStr: string | undefined | null): number {
  if (!timeStr) return NaN;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return NaN;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h + m / 60;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function nextDateStr(dateStr: string): string {
  return formatDate(addDays(parseDate(dateStr), 1));
}

function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getISOWeekYear(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function weekKey(y: number, w: number): string {
  return `${y}-W${String(w).padStart(2, '0')}`;
}

function emptyBreakdown(): ShiftHourBreakdown {
  return {
    total: 0,
    regular: 0,
    night: 0,
    sunday: 0,
    holiday: 0,
    holidayNational: 0,
    holidayAutonomico: 0,
    holidayProvincial: 0,
    holidayMunicipal: 0,
    weekend: 0,
  };
}

function nightHoursInInterval(start: number, end: number, nightStart: number, nightEnd: number): number {
  const intervals = end <= start
    ? [[start, 24], [0, end]]
    : [[start, end]];

  const nightWindows = nightEnd <= nightStart
    ? [[nightStart, 24], [0, nightEnd]]
    : [[nightStart, nightEnd]];

  let total = 0;
  for (const [a, b] of intervals) {
    for (const [c, d] of nightWindows) {
      total += Math.max(0, Math.min(b, d) - Math.max(a, c));
    }
  }
  return total;
}

function compute24hNight(nightStart: number, nightEnd: number, totalH: number): number {
  const rawNight = nightEnd <= nightStart
    ? nightEnd + (24 - nightStart)
    : nightEnd - nightStart;
  return (rawNight / 24) * totalH;
}

// ─── Holiday Matching ────────────────────────────────────────────

export function findHolidayForDate(dateStr: string, holidays: HolidayInfo[]): HolidayInfo | null {
  const exact = holidays.find(h => h.date === dateStr);
  if (exact) return exact;

  const monthDay = dateStr.slice(5);
  const recurring = holidays.find(h => h.recurring === true && h.date.slice(5) === monthDay);
  return recurring || null;
}

// ─── 1. Calculate Working Dates ──────────────────────────────────

export function calculateWorkingDates(config: DateConfig, holidays: HolidayInfo[]): string[] {
  const dates: string[] = [];

  if (config.dateMode === 'specific' && config.specificDates && config.specificDates.length > 0) {
    for (const ds of config.specificDates) {
      const d = parseDate(ds);
      if (config.excludeSundays && isSunday(d)) continue;

      if (config.excludeHolidays) {
        const h = findHolidayForDate(ds, holidays);
        if (h && (!config.holidayTypesExcluded || config.holidayTypesExcluded.length === 0 || config.holidayTypesExcluded.includes(h.type))) {
          continue;
        }
      }

      dates.push(ds);
    }
    return dates.sort();
  }

  if (!config.dateRangeStart || !config.dateRangeEnd) return dates;

  const start = parseDate(config.dateRangeStart);
  const end = parseDate(config.dateRangeEnd);
  if (end < start) return dates;

  const daysOfWeek = config.daysOfWeek && config.daysOfWeek.length > 0
    ? config.daysOfWeek
    : [0, 1, 2, 3, 4, 5, 6];

  let current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const dateStr = formatDate(current);

    if (config.daysOfWeek && config.daysOfWeek.length > 0 && !daysOfWeek.includes(dayOfWeek)) {
      current = addDays(current, 1);
      continue;
    }

    if (config.excludeSundays && isSunday(current)) {
      current = addDays(current, 1);
      continue;
    }

    if (config.excludeHolidays) {
      const h = findHolidayForDate(dateStr, holidays);
      if (h && (!config.holidayTypesExcluded || config.holidayTypesExcluded.length === 0 || config.holidayTypesExcluded.includes(h.type))) {
        current = addDays(current, 1);
        continue;
      }
    }

    dates.push(dateStr);
    current = addDays(current, 1);
  }

  return dates;
}

// ─── 2. Calculate Shift Hours ────────────────────────────────────

function addSpecialDayHours(result: ShiftHourBreakdown, dateStr: string, hours: number, holidays: HolidayInfo[]): void {
  if (hours <= 0) return;

  const date = parseDate(dateStr);
  const holiday = findHolidayForDate(dateStr, holidays);

  // Día especial exclusivo por tramo real de calendario: festivo > domingo > fin de semana.
  if (holiday) {
    result.holiday += hours;
    if (holiday.type === 'nacional') result.holidayNational += hours;
    else if (holiday.type === 'autonomico') result.holidayAutonomico += hours;
    else if (holiday.type === 'provincial') result.holidayProvincial += hours;
    else if (holiday.type === 'municipal') result.holidayMunicipal += hours;
  } else if (isSunday(date)) {
    result.sunday += hours;
  } else if (isWeekend(date)) {
    result.weekend += hours;
  }
}

function addSpecialDayHoursForShift(
  result: ShiftHourBreakdown,
  shift: ShiftConfig,
  dateStr: string,
  holidays: HolidayInfo[],
  rawTotal?: number,
): void {
  const effectiveTotal = result.total;
  if (effectiveTotal <= 0) return;

  if (shift.shiftType === '24h') {
    addSpecialDayHours(result, dateStr, effectiveTotal, holidays);
    return;
  }

  const hasExplicitTimes = !!(shift.shiftStartTime && shift.shiftEndTime);
  const start = hasExplicitTimes ? parseHHMM(shift.shiftStartTime) : NaN;
  const end = hasExplicitTimes ? parseHHMM(shift.shiftEndTime) : NaN;

  if (hasExplicitTimes && Number.isFinite(start) && Number.isFinite(end)) {
    const intervalTotal = rawTotal ?? (end <= start ? (24 - start) + end : end - start);
    if (intervalTotal <= 0) return;
    const factor = effectiveTotal / intervalTotal;

    if (end <= start) {
      addSpecialDayHours(result, dateStr, (24 - start) * factor, holidays);
      addSpecialDayHours(result, nextDateStr(dateStr), end * factor, holidays);
    } else {
      addSpecialDayHours(result, dateStr, (end - start) * factor, holidays);
    }
    return;
  }

  addSpecialDayHours(result, dateStr, effectiveTotal, holidays);
}

export function calculateShiftHours(
  shift: ShiftConfig,
  dateStr: string,
  holidays: HolidayInfo[],
  nightStart: number = 22,
  nightEnd: number = 6,
): ShiftHourBreakdown {
  const result = emptyBreakdown();
  const hoursPerDay = Math.max(0, toFiniteNumber(shift.hoursPerDay, 0));
  const breakH = Math.max(0, toFiniteNumber(shift.breakMinutes, 0)) / 60;
  let rawTotalForSpecialDay: number | undefined;

  if (shift.shiftType === '24h') {
    result.total = Math.max(0, 24 - breakH);
    result.night = compute24hNight(nightStart, nightEnd, result.total);
    result.regular = Math.max(0, result.total - result.night);
    rawTotalForSpecialDay = 24;
  } else if (shift.shiftType === 'custom' && shift.shiftStartTime && shift.shiftEndTime) {
    const start = parseHHMM(shift.shiftStartTime);
    const end = parseHHMM(shift.shiftEndTime);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const rawTotal = end <= start ? (24 - start) + end : end - start;
      result.total = Math.max(0, rawTotal - breakH);
      const rawNight = nightHoursInInterval(start, end, nightStart, nightEnd);
      result.night = Math.min(rawNight, result.total);
      result.regular = Math.max(0, result.total - result.night);
      rawTotalForSpecialDay = rawTotal;
    }
  } else if (shift.shiftType === 'night') {
    result.total = Math.max(0, hoursPerDay - breakH);

    if (shift.shiftStartTime && shift.shiftEndTime) {
      const start = parseHHMM(shift.shiftStartTime);
      const end = parseHHMM(shift.shiftEndTime);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const rawTotal = end <= start ? (24 - start) + end : end - start;
        const rawNight = nightHoursInInterval(start, end, nightStart, nightEnd);
        result.night = Math.min(rawNight, result.total);
        result.regular = Math.max(0, result.total - result.night);
        rawTotalForSpecialDay = rawTotal;
      } else {
        result.night = result.total;
      }
    } else {
      result.night = result.total;
    }
  } else {
    result.total = Math.max(0, hoursPerDay - breakH);
    result.regular = result.total;
  }

  addSpecialDayHoursForShift(result, shift, dateStr, holidays, rawTotalForSpecialDay);
  return result;
}

// ─── 3. Calculate Minimum Staff ──────────────────────────────────

function buildWeeklyBreakdownFromDailyHours(entries: { date: string; hours: number }[]): WeeklyHoursEntry[] {
  const weekMap = new Map<string, number>();

  for (const entry of entries) {
    const d = parseDate(entry.date);
    const { year, week } = getISOWeekYear(d);
    const key = weekKey(year, week);
    weekMap.set(key, (weekMap.get(key) || 0) + Math.max(0, entry.hours));
  }

  return [...weekMap.entries()]
    .map(([key, hours]) => {
      const [yStr, wStr] = key.split('-W');
      return {
        weekKey: key,
        year: parseInt(yStr, 10),
        week: parseInt(wStr, 10),
        hours: round2(hours),
      };
    })
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey));
}

function restCriterionForDates(workingDates: string[]): number {
  if (workingDates.length === 0) return 1;

  const uniqueDaysOfWeek = new Set<number>();
  for (const dateStr of workingDates) uniqueDaysOfWeek.add(parseDate(dateStr).getDay());

  const sortedDates = [...workingDates].sort();
  let maxConsecutive = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prev = parseDate(sortedDates[i - 1]);
    const curr = parseDate(sortedDates[i]);
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) {
      currentStreak++;
      maxConsecutive = Math.max(maxConsecutive, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return uniqueDaysOfWeek.size === 7 || maxConsecutive >= 7 ? 2 : 1;
}

function calculateMinStaffFromDailyHours(
  entries: { date: string; hours: number }[],
  maxWeeklyHours: number = 40,
): { minStaff: number; weeklyBreakdown: WeeklyHoursEntry[] } {
  if (entries.length === 0 || entries.every(e => e.hours <= 0)) {
    return { minStaff: 1, weeklyBreakdown: [] };
  }

  const weeklyBreakdown = buildWeeklyBreakdownFromDailyHours(entries);
  const maxWeekHours = weeklyBreakdown.reduce((max, w) => Math.max(max, w.hours), 0);
  const hoursCriterion = Math.max(1, Math.ceil(maxWeekHours / maxWeeklyHours));
  const restCriterion = restCriterionForDates(entries.map(e => e.date));

  return { minStaff: Math.max(hoursCriterion, restCriterion), weeklyBreakdown };
}

export function calculateMinStaff(
  workingDates: string[],
  hoursPerDay: number,
  maxWeeklyHours: number = 40,
): { minStaff: number; weeklyBreakdown: WeeklyHoursEntry[] } {
  const daily = workingDates.map(date => ({ date, hours: Math.max(0, hoursPerDay) }));
  return calculateMinStaffFromDailyHours(daily, maxWeeklyHours);
}

// ─── 4. Labor Validation ─────────────────────────────────────────

function validateLaborRulesFromDailyHours(
  dailyHours: { date: string; hours: number }[],
  shift: ShiftConfig,
  plantillaSeleccionada: number,
  maxWeeklyHours: number = 40,
  maxDailyHours: number = 12,
  maxConsecutiveDays: number = 6,
  minRestHours: number = 11,
): LaborWarning[] {
  const warnings: LaborWarning[] = [];
  if (dailyHours.length === 0) return warnings;

  const maxDaily = Math.max(...dailyHours.map(d => d.hours));
  if (maxDaily > maxDailyHours) {
    warnings.push({
      type: 'max_daily_exceeded',
      severity: 'error',
      message: `Turno de ${maxDaily}h excede el maximo de ${maxDailyHours}h diarias.`,
    });
  }

  if (shift.shiftType === '24h') {
    warnings.push({
      type: '24h_shift',
      severity: 'warning',
      message: 'Turnos de 24 horas configurados. Verificar descanso minimo entre turnos.',
    });
  }

  if (shift.shiftType === 'night' || (shift.shiftType === 'custom' && shift.shiftStartTime && parseHHMM(shift.shiftStartTime) >= 22)) {
    warnings.push({
      type: 'night_shift',
      severity: 'info',
      message: 'Turno nocturno detectado. Se aplicara recargo de nocturnidad si esta configurado.',
    });
  }

  const weeklyBreakdown = buildWeeklyBreakdownFromDailyHours(dailyHours);
  for (const week of weeklyBreakdown) {
    const hoursPerPro = week.hours / Math.max(1, plantillaSeleccionada);
    if (hoursPerPro > maxWeeklyHours) {
      const overtime = hoursPerPro - maxWeeklyHours;
      const needed = Math.ceil(week.hours / maxWeeklyHours);
      warnings.push({
        type: 'max_weekly_exceeded',
        severity: 'error',
        message: `Semana ${week.weekKey}: ${hoursPerPro.toFixed(1)}h/profesional (max ${maxWeeklyHours}h). Exceso de ${overtime.toFixed(1)}h.`,
        weekKey: week.weekKey,
        details: `Con ${plantillaSeleccionada} profesional(es), cada uno haria ${hoursPerPro.toFixed(1)}h semanales. Se necesitan al menos ${needed} profesional(es).`,
      });
    }

    if (hoursPerPro > maxWeeklyHours * 1.2) {
      warnings.push({
        type: 'overtime_needed',
        severity: 'warning',
        message: `Semana ${week.weekKey}: Se requeririan muchas horas extra (${(hoursPerPro - maxWeeklyHours).toFixed(1)}h extra por profesional).`,
        weekKey: week.weekKey,
      });
    }
  }

  const sortedDates = dailyHours.map(d => d.date).sort();
  let maxConsecutive = 1;
  let currentStreak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = parseDate(sortedDates[i - 1]);
    const curr = parseDate(sortedDates[i]);
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) {
      currentStreak++;
      maxConsecutive = Math.max(maxConsecutive, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  if (maxConsecutive > maxConsecutiveDays) {
    warnings.push({
      type: 'continuous_coverage',
      severity: 'warning',
      message: `Cobertura continua de ${maxConsecutive} dias seguidos (max recomendado: ${maxConsecutiveDays}).`,
    });
  }

  if (maxDaily >= 12 || shift.shiftType === '24h') {
    warnings.push({
      type: 'rest_violation',
      severity: 'warning',
      message: `Con turnos de ${maxDaily.toFixed(1)}h, verificar descanso minimo de ${minRestHours}h entre turnos consecutivos.`,
    });
  }

  return warnings;
}

export function validateLaborRules(
  workingDates: string[],
  hoursPerDay: number,
  shift: ShiftConfig,
  plantillaSeleccionada: number,
  puestosSimultaneos: number,
  maxWeeklyHours: number = 40,
  maxDailyHours: number = 12,
  maxConsecutiveDays: number = 6,
  minRestHours: number = 11,
): LaborWarning[] {
  void puestosSimultaneos;
  const effectiveDailyHours = Math.max(0, hoursPerDay - (Math.max(0, toFiniteNumber(shift.breakMinutes, 0)) / 60));
  const daily = workingDates.map(date => ({ date, hours: effectiveDailyHours }));
  return validateLaborRulesFromDailyHours(
    daily,
    shift,
    plantillaSeleccionada,
    maxWeeklyHours,
    maxDailyHours,
    maxConsecutiveDays,
    minRestHours,
  );
}

// ─── 5. Surcharge Calculation ────────────────────────────────────

const AUTO_SURCHARGE_TYPES: SurchargeType[] = [
  'nocturnidad', 'domingo', 'festivo', 'festivo_nacional', 'festivo_autonomico',
  'festivo_provincial', 'festivo_municipal', 'fin_de_semana',
];

export function calculateSurcharges(
  totalBreakdown: ShiftHourBreakdown,
  allSurcharges: { type: SurchargeType; name: string; surchargeType: SurchargeKind; value: number }[],
  pricePerHour: number,
  enabledSurcharges: SurchargeType[] = [],
): SurchargeEntry[] {
  const entries: SurchargeEntry[] = [];
  const safePrice = Math.max(0, toFiniteNumber(pricePerHour, 0));

  const specificActiveHours = (type: SurchargeType, hours: number): number => {
    const surcharge = allSurcharges.find(s => s.type === type && toFiniteNumber(s.value, 0) !== 0);
    if (!surcharge) return 0;
    return AUTO_SURCHARGE_TYPES.includes(type) || enabledSurcharges.includes(type) ? hours : 0;
  };

  for (const surcharge of allSurcharges) {
    const value = toFiniteNumber(surcharge.value, 0);
    if (value === 0) continue;

    const isAuto = AUTO_SURCHARGE_TYPES.includes(surcharge.type);
    const isManualEnabled = enabledSurcharges.includes(surcharge.type);
    if (!isAuto && !isManualEnabled) continue;

    let hours = 0;
    switch (surcharge.type) {
      case 'nocturnidad':
        hours = totalBreakdown.night;
        break;
      case 'domingo':
        hours = totalBreakdown.sunday;
        break;
      case 'festivo': {
        const specificH =
          specificActiveHours('festivo_nacional', totalBreakdown.holidayNational) +
          specificActiveHours('festivo_autonomico', totalBreakdown.holidayAutonomico) +
          specificActiveHours('festivo_provincial', totalBreakdown.holidayProvincial) +
          specificActiveHours('festivo_municipal', totalBreakdown.holidayMunicipal);
        hours = Math.max(0, totalBreakdown.holiday - specificH);
        break;
      }
      case 'festivo_nacional':
        hours = totalBreakdown.holidayNational;
        break;
      case 'festivo_autonomico':
        hours = totalBreakdown.holidayAutonomico;
        break;
      case 'festivo_provincial':
        hours = totalBreakdown.holidayProvincial;
        break;
      case 'festivo_municipal':
        hours = totalBreakdown.holidayMunicipal;
        break;
      case 'fin_de_semana':
        hours = totalBreakdown.weekend;
        break;
      case 'urgencia':
      case 'dificil_cobertura':
      case 'desplazamiento':
      case 'servicio_premium':
      case 'municipio_especial':
      case 'special_price':
        hours = totalBreakdown.total;
        break;
      default:
        hours = 0;
    }

    if (hours <= 0) continue;

    let amount = 0;
    switch (surcharge.surchargeType) {
      case 'percentage':
        amount = safePrice * hours * (value / 100);
        break;
      case 'fixed':
        amount = value * hours;
        break;
      case 'multiplier':
        amount = safePrice * hours * (value - 1);
        break;
      case 'special_price':
        amount = (value - safePrice) * hours;
        break;
    }

    const isSpecialPrice = surcharge.surchargeType === 'special_price';
    if ((isSpecialPrice && amount !== 0) || (!isSpecialPrice && amount > 0)) {
      entries.push({
        type: surcharge.type,
        name: surcharge.name,
        hours: round2(hours),
        surchargeType: surcharge.surchargeType,
        value,
        amount: round2(amount),
      });
    }
  }

  return entries;
}

// ─── 6. Operational schedule calculation ─────────────────────────

export function calculateServiceBlock(params: {
  block: {
    serviceName: string;
    professionalCategory: string;
    puestosSimultaneos: number;
    plantillaSeleccionada?: number;
    pricePerHour: number;
    dateMode: string;
    specificDates?: string[];
    dateRangeStart?: string;
    dateRangeEnd?: string;
    daysOfWeek?: number[];
    excludeSundays: boolean;
    excludeHolidays: boolean;
    holidayTypesExcluded?: HolidayType[];
    shiftType: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
    hoursPerDay: number;
    breakMinutes: number;
    unitType: string;
    quantity: number;
    fixedPrice?: number;
    enabledSurcharges?: SurchargeType[];
    blockType?: string;
    accommodationNights?: number;
    accommodationPersons?: number;
  };
  holidays: HolidayInfo[];
  surcharges: { type: SurchargeType; name: string; surchargeType: SurchargeKind; value: number }[];
  laborRules: { maxWeeklyHours: number; maxDailyHours: number; minRestBetweenShiftsH: number; maxConsecutiveDays: number; nightStartHour: number; nightEndHour: number };
}): BlockCalculationResult {
  const { block, holidays, surcharges, laborRules } = params;
  const safeHPD = Math.max(0, toFiniteNumber(block.hoursPerDay, 0));
  const safeBreak = Math.max(0, toFiniteNumber(block.breakMinutes, 0));
  const explicitPlantilla = block.plantillaSeleccionada;
  const safePlantilla = Math.max(1, Math.round(toFiniteNumber(explicitPlantilla, 1)));

  if (block.dateMode === 'range' && block.dateRangeStart && block.dateRangeEnd && block.dateRangeEnd < block.dateRangeStart) {
    return {
      workingDates: [], totalWorkingDays: 0, hoursPerPosition: 0,
      coverageHours: 0, totalHours: 0, shiftBreakdown: emptyBreakdown(),
      surcharges: [], totalSurcharges: 0,
      puestosSimultaneos: Math.max(1, Math.round(toFiniteNumber(block.puestosSimultaneos, 1))),
      plantillaMinimaRecomendada: 1, plantillaSeleccionada: safePlantilla, deficitPlantilla: 0,
      weeklyHoursPerPro: [], overtimeHours: 0, laborWarnings: [], subtotal: 0, totalWithSurcharges: 0,
    };
  }

  const simpleBlockTypes = new Set([
    'material', 'desplazamiento', 'dietas', 'alojamiento', 'ambulancia',
    'telemedicina', 'curso', 'otros', 'servicio_fijo',
  ]);
  const simpleUnitTypes = new Set(['servicio', 'kilometro', 'unidad']);
  const isSimpleBlock = simpleBlockTypes.has(block.blockType || '') || (simpleUnitTypes.has(block.unitType) && block.unitType !== 'dia');

  if (isSimpleBlock) {
    let subtotal: number;
    let effectiveQuantity: number;

    if (block.blockType === 'alojamiento') {
      const nights = Math.max(0, toFiniteNumber(block.accommodationNights ?? block.quantity, 1));
      const persons = Math.max(0, toFiniteNumber(block.accommodationPersons, 1));
      const pricePerNight = Math.max(0, toFiniteNumber(block.fixedPrice ?? block.pricePerHour, 0));
      effectiveQuantity = nights * persons;
      subtotal = pricePerNight * effectiveQuantity;
    } else {
      const basePrice = Math.max(0, toFiniteNumber(block.fixedPrice ?? block.pricePerHour, 0));
      effectiveQuantity = Math.max(0, toFiniteNumber(block.quantity, 1));
      subtotal = basePrice * effectiveQuantity;
    }

    subtotal = round2(subtotal);

    return {
      workingDates: [],
      totalWorkingDays: 0,
      hoursPerPosition: effectiveQuantity,
      coverageHours: effectiveQuantity,
      totalHours: 0,
      shiftBreakdown: emptyBreakdown(),
      surcharges: [],
      totalSurcharges: 0,
      puestosSimultaneos: 1,
      plantillaMinimaRecomendada: 1,
      plantillaSeleccionada: 1,
      deficitPlantilla: 0,
      weeklyHoursPerPro: [],
      overtimeHours: 0,
      laborWarnings: [],
      subtotal,
      totalWithSurcharges: subtotal,
    };
  }

  const workingDates = calculateWorkingDates({
    dateMode: block.dateMode as 'specific' | 'range',
    specificDates: block.specificDates,
    dateRangeStart: block.dateRangeStart,
    dateRangeEnd: block.dateRangeEnd,
    daysOfWeek: block.daysOfWeek,
    excludeSundays: block.excludeSundays,
    excludeHolidays: block.excludeHolidays,
    holidayTypesExcluded: block.holidayTypesExcluded,
  }, holidays);

  const posBreakdown = emptyBreakdown();
  const dailyHours: { date: string; hours: number }[] = [];

  for (const dateStr of workingDates) {
    const dayBD = calculateShiftHours(
      {
        shiftType: block.shiftType as any,
        shiftStartTime: block.shiftStartTime,
        shiftEndTime: block.shiftEndTime,
        hoursPerDay: safeHPD,
        breakMinutes: safeBreak,
      },
      dateStr,
      holidays,
      laborRules.nightStartHour,
      laborRules.nightEndHour,
    );

    for (const key of Object.keys(posBreakdown) as (keyof ShiftHourBreakdown)[]) {
      posBreakdown[key] += dayBD[key];
    }
    dailyHours.push({ date: dateStr, hours: dayBD.total });
  }

  const puestosSimultaneos = Math.max(1, Math.round(toFiniteNumber(block.puestosSimultaneos, 1)));
  const hoursPerPosition = posBreakdown.total;
  const coverageHours = hoursPerPosition * puestosSimultaneos;

  const { minStaff, weeklyBreakdown } = calculateMinStaffFromDailyHours(dailyHours, laborRules.maxWeeklyHours);
  const plantillaSeleccionada = safePlantilla;
  const deficitPlantilla = Math.max(0, minStaff - plantillaSeleccionada);

  const laborWarnings = validateLaborRulesFromDailyHours(
    dailyHours,
    {
      shiftType: block.shiftType as any,
      shiftStartTime: block.shiftStartTime,
      shiftEndTime: block.shiftEndTime,
      hoursPerDay: safeHPD,
      breakMinutes: safeBreak,
    },
    plantillaSeleccionada,
    laborRules.maxWeeklyHours,
    laborRules.maxDailyHours,
    laborRules.maxConsecutiveDays,
    laborRules.minRestBetweenShiftsH,
  );

  if (deficitPlantilla > 0) {
    laborWarnings.push({
      type: 'staff_deficit',
      severity: 'warning',
      message: `Plantilla seleccionada (${plantillaSeleccionada}) es inferior a la minima recomendada (${minStaff}). Deficit de ${deficitPlantilla} profesional(es).`,
      details: `Se necesitarian ${minStaff} profesionales para cubrir sin horas extra. Con ${plantillaSeleccionada}, habra horas extra estimadas.`,
    });
  }

  let overtimeHours = 0;
  if (plantillaSeleccionada < minStaff) {
    for (const w of weeklyBreakdown) {
      const perPro = w.hours / plantillaSeleccionada;
      if (perPro > laborRules.maxWeeklyHours) overtimeHours += perPro - laborRules.maxWeeklyHours;
    }
  }
  overtimeHours = round2(overtimeHours);

  const coverageBreakdown: ShiftHourBreakdown = { ...posBreakdown };
  for (const key of Object.keys(coverageBreakdown) as (keyof ShiftHourBreakdown)[]) {
    coverageBreakdown[key] = posBreakdown[key] * puestosSimultaneos;
  }

  const safePrice = Math.max(0, toFiniteNumber(block.pricePerHour, 0));
  const surchargeEntries = calculateSurcharges(coverageBreakdown, surcharges, safePrice, block.enabledSurcharges || []);
  const totalSurcharges = surchargeEntries.reduce((sum, s) => sum + s.amount, 0);

  const hoursBase = posBreakdown.regular + posBreakdown.night;
  const subtotal = Math.max(0, hoursBase * safePrice * puestosSimultaneos);
  const totalWithSurcharges = subtotal + totalSurcharges;

  return {
    workingDates,
    totalWorkingDays: workingDates.length,
    hoursPerPosition,
    coverageHours,
    totalHours: posBreakdown.total,
    shiftBreakdown: posBreakdown,
    surcharges: surchargeEntries,
    totalSurcharges: round2(totalSurcharges),
    puestosSimultaneos,
    plantillaMinimaRecomendada: minStaff,
    plantillaSeleccionada,
    deficitPlantilla,
    weeklyHoursPerPro: weeklyBreakdown,
    overtimeHours,
    laborWarnings,
    subtotal: round2(subtotal),
    totalWithSurcharges: round2(totalWithSurcharges),
  };
}

// ─── 7. Budget Totals ────────────────────────────────────────────

export function calculateBudgetTotals(
  blockResults: BlockCalculationResult[],
  discountPercent: number = 0,
  ivaPercent: number = 21,
): { subtotal: number; totalSurcharges: number; discountAmount: number; ivaAmount: number; totalFinal: number } {
  const safeBlocks = Array.isArray(blockResults) ? blockResults : [];
  const subtotal = safeBlocks.reduce((s, b) => s + toFiniteNumber(b?.subtotal), 0);
  const totalSurcharges = safeBlocks.reduce((s, b) => s + toFiniteNumber(b?.totalSurcharges), 0);
  const cleanDiscount = Math.min(Math.max(toFiniteNumber(discountPercent, 0), 0), 100);
  const cleanIva = Math.min(Math.max(toFiniteNumber(ivaPercent, 21), 0), 100);

  const baseForDiscount = subtotal + totalSurcharges;
  const discountAmount = baseForDiscount * (cleanDiscount / 100);
  const afterDiscount = Math.max(baseForDiscount - discountAmount, 0);
  const ivaAmount = afterDiscount * (cleanIva / 100);
  const totalFinal = afterDiscount + ivaAmount;

  return {
    subtotal: round2(subtotal),
    totalSurcharges: round2(totalSurcharges),
    discountAmount: round2(discountAmount),
    ivaAmount: round2(ivaAmount),
    totalFinal: round2(totalFinal),
  };
}
