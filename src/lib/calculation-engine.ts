// ─── Motor de Cálculo de Presupuestos Sanitarios v2 ──────────
// CORRECCIONES v2:
// - puestosSimultaneos vs plantillaMinimaRecomendada separados
// - Semanas ISO agrupadas por año (no mezcla semana 1 de años distintos)
// - Recargos automáticos vs opt-in/manuales
// - Subtotal = horasCobertura × precioHora (NO multiplica por plantilla)
// - Días por defecto: todos (0-6), solo excluye si excludeSundays=true

import type {
  DateConfig, ShiftConfig, ShiftHourBreakdown, HolidayInfo,
  LaborWarning, SurchargeEntry, SurchargeType, SurchargeKind,
  BlockCalculationResult, HolidayType, WeeklyHoursEntry,
} from './types';

// ─── Helpers ─────────────────────────────────────────────────────

/** E4: Parse 'HH:MM' to decimal hours. Returns NaN for invalid input. */
function parseHHMM(timeStr: string | undefined | null): number {
  if (!timeStr) return NaN;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return NaN;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h + m / 60;
}

/** E1: Compute night hours for a 24h shift using dual-window overlap.
 * Reuses the same logic as the 'custom' branch (A4 fix).
 * A 24h shift spans [0, 24). Break is distributed uniformly.
 * Night fraction = nightH(0,24) / 24; actual night = total * fraction.
 */
function compute24hNight(nightStart: number, nightEnd: number, totalH: number): number {
  // Compute raw night hours for the full 24h span
  let rawNight = 0;
  if (nightEnd <= nightStart) {
    // Two windows: [0, nightEnd] and [nightStart, 24)
    rawNight = nightEnd + (24 - nightStart);
  } else {
    // Single window: [nightStart, nightEnd)
    rawNight = nightEnd - nightStart;
  }
  // Scale by the ratio of actual hours to 24h (uniform break distribution)
 return (rawNight / 24) * totalH;
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

function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Returns ISO week number AND year for that week (not the calendar year of the date) */
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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ─── Holiday Matching ────────────────────────────────────────────
// A3 FIX: Emparejar por FECHA COMPLETA por defecto.
// Solo los festivos marcados como recurring=true coinciden por mes-día
// (festivos fijos como 01-01, 06-01, 25-12, etc.).

export function findHolidayForDate(dateStr: string, holidays: HolidayInfo[]): HolidayInfo | null {
  // 1. Búsqueda exacta por fecha completa (año-mes-día)
  const exact = holidays.find(h => h.date === dateStr);
  if (exact) return exact;

  // 2. Búsqueda recurrente por mes-día (solo si recurring=true)
  const monthDay = dateStr.slice(5); // "MM-DD"
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
        if (h) {
          if (!config.holidayTypesExcluded || config.holidayTypesExcluded.length === 0 || config.holidayTypesExcluded.includes(h.type)) {
            continue;
          }
        }
      }
      dates.push(ds);
    }
    return dates.sort();
  }

  // Range mode
  if (!config.dateRangeStart || !config.dateRangeEnd) return dates;

  const start = parseDate(config.dateRangeStart);
  const end = parseDate(config.dateRangeEnd);
  // Default: all days (0-6). If daysOfWeek is explicitly set, use that.
  const daysOfWeek = config.daysOfWeek && config.daysOfWeek.length > 0
    ? config.daysOfWeek
    : [0, 1, 2, 3, 4, 5, 6];

  let current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const dateStr = formatDate(current);

    // Check day of week filter (only if explicitly set)
    if (config.daysOfWeek && config.daysOfWeek.length > 0) {
      if (!daysOfWeek.includes(dayOfWeek)) {
        current = addDays(current, 1);
        continue;
      }
    }

    // Check Sunday exclusion
    if (config.excludeSundays && isSunday(current)) {
      current = addDays(current, 1);
      continue;
    }

    // Check holiday exclusion
    if (config.excludeHolidays) {
      const h = findHolidayForDate(dateStr, holidays);
      if (h) {
        if (!config.holidayTypesExcluded || config.holidayTypesExcluded.length === 0 || config.holidayTypesExcluded.includes(h.type)) {
          current = addDays(current, 1);
          continue;
        }
      }
    }

    dates.push(dateStr);
    current = addDays(current, 1);
  }

  return dates;
}

// ─── 2. Calculate Shift Hours ────────────────────────────────────

export function calculateShiftHours(
  shift: ShiftConfig,
  dateStr: string,
  holidays: HolidayInfo[],
  nightStart: number = 22,
  nightEnd: number = 6,
): ShiftHourBreakdown {
  const date = parseDate(dateStr);
  const sunday = isSunday(date);
  const weekend = isWeekend(date);
  const holiday = findHolidayForDate(dateStr, holidays);

  const result: ShiftHourBreakdown = {
    total: 0, regular: 0, night: 0,
    sunday: 0, holiday: 0,
    holidayNational: 0, holidayAutonomico: 0,
    holidayProvincial: 0, holidayMunicipal: 0,
    weekend: 0,
  };

  if (shift.shiftType === '24h') {
    // A1 FIX + E1 FIX: 24h turnos facturan todas sus horas.
    // Nocturnidad calculada con la misma lógica dual-window que 'custom' (A4),
    // no con fórmula hardcodeada. Break distribuido uniformemente.
    result.total = Math.max(0, 24 - (shift.breakMinutes / 60));
    result.night = compute24hNight(nightStart, nightEnd, result.total);
    result.regular = Math.max(0, result.total - result.night);
  } else if (shift.shiftType === 'morning') {
    result.total = Math.max(0, shift.hoursPerDay - (shift.breakMinutes / 60));
    result.regular = result.total;
  } else if (shift.shiftType === 'afternoon') {
    result.total = Math.max(0, shift.hoursPerDay - (shift.breakMinutes / 60));
    result.regular = result.total;
  } else if (shift.shiftType === 'night') {
    result.total = Math.max(0, shift.hoursPerDay - (shift.breakMinutes / 60));
    // A5 FIX: Calcular nocturnidad REAL si hay horario, no asumir 100%.
    if (shift.shiftStartTime && shift.shiftEndTime) {
      const [sh, sm] = shift.shiftStartTime.split(':').map(Number);
      const [eh, em] = shift.shiftEndTime.split(':').map(Number);
      const startDecimal = sh + sm / 60;
      const endDecimal = eh + em / 60;
      const crossesMidnight = endDecimal <= startDecimal;
      let nightH = 0;
      if (nightEnd <= nightStart) {
        if (crossesMidnight) {
          const nightBeforeMidnight = startDecimal >= nightStart
            ? (24 - startDecimal) : (24 - nightStart);
          const nightAfterMidnight = Math.min(endDecimal, nightEnd);
          nightH = nightBeforeMidnight + nightAfterMidnight;
        } else {
          const w1 = Math.max(0, Math.min(endDecimal, nightEnd) - Math.max(startDecimal, 0));
          const w2 = Math.max(0, Math.min(endDecimal, 24) - Math.max(startDecimal, nightStart));
          nightH = w1 + w2;
        }
      }
      result.night = Math.min(nightH, result.total);
      result.regular = result.total - result.night;
    } else {
      // Sin horario explícito: asumir todo nocturno (comportamiento original seguro)
      result.night = result.total;
    }
  } else if (shift.shiftType === 'custom' && shift.shiftStartTime && shift.shiftEndTime) {
    const [sh, sm] = shift.shiftStartTime.split(':').map(Number);
    const [eh, em] = shift.shiftEndTime.split(':').map(Number);
    const startDecimal = sh + sm / 60;
    const endDecimal = eh + em / 60;
    const breakH = shift.breakMinutes / 60;
    const crossesMidnight = endDecimal <= startDecimal;

    let totalH: number;
    if (crossesMidnight) {
      totalH = (24 - startDecimal) + endDecimal - breakH;
    } else {
      totalH = endDecimal - startDecimal - breakH;
    }
    totalH = Math.max(0, totalH);
    result.total = totalH;

    // A4 FIX: Night hours — two independent windows
    // Window 1: [0, nightEnd]   (e.g. [0, 6])
    // Window 2: [nightStart, 24) (e.g. [22, 24))
    // A non-midnight-crossing shift can overlap BOTH windows (e.g. 05:00–23:00).
    // Must sum both overlaps instead of using exclusive if/else-if.
    let nightH = 0;
    if (nightEnd <= nightStart) {
      if (crossesMidnight) {
        const nightBeforeMidnight = startDecimal >= nightStart
          ? (24 - startDecimal) : (24 - nightStart);
        const nightAfterMidnight = Math.min(endDecimal, nightEnd);
        nightH = nightBeforeMidnight + nightAfterMidnight;
      } else {
        // Window 1: overlap of [start, end] with [0, nightEnd]
        const w1 = Math.max(0, Math.min(endDecimal, nightEnd) - Math.max(startDecimal, 0));
        // Window 2: overlap of [start, end] with [nightStart, 24)
        const w2 = Math.max(0, Math.min(endDecimal, 24) - Math.max(startDecimal, nightStart));
        nightH = w1 + w2;
      }
    }
    result.night = Math.min(nightH, totalH);
    result.regular = totalH - result.night;
  } else {
    result.total = shift.hoursPerDay - (shift.breakMinutes / 60);
    result.regular = result.total;
  }

  // A2 FIX: Exclusive special-day flags
  // Jerarquía: festivo (nacional > autonomico > provincial > municipal) > domingo > fin_de_semana
  // Cada hora solo marca UN tipo de "día especial", evitando dobles/triples recargos.
  // La nocturnidad es compatible y se suma aparte (concepto distinto).
  if (holiday) {
    result.holiday = result.total;
    if (holiday.type === 'nacional') result.holidayNational = result.total;
    else if (holiday.type === 'autonomico') result.holidayAutonomico = result.total;
    else if (holiday.type === 'provincial') result.holidayProvincial = result.total;
    else if (holiday.type === 'municipal') result.holidayMunicipal = result.total;
    // Los festivos NO marcan domingo ni weekend (la jerarquía los excluye)
  } else if (sunday) {
    result.sunday = result.total;
    // Sunday es weekend, pero solo se marca como domingo (domingo > fin_de_semana)
  } else if (weekend) {
    result.weekend = result.total;
  }

  return result;
}

// ─── 3. Calculate Minimum Staff (Plantilla Mínima) ───────────────
// Groups by year+week to avoid mixing ISO weeks across years
//
// B1 FIX: Dos criterios para plantilla mínima:
//   criterio_horas = ceil(maxHorasSemana / maxWeeklyHours)
//     → tope legal semanal (ej: 40h ET art. 34). La jornada de convenio,
//       si fuera menor, la fija administración (no se hardcodea aquí).
//   criterio_descanso = 2 si el servicio cubre los 7 días de la semana
//     o tiene ≥7 días consecutivos (ET art. 37: mínimo 1,5 días de
//     descanso semanal → una persona no puede cubrir 7 días seguidos).
//   minStaff = max(criterio_horas, criterio_descanso)

export function calculateMinStaff(
  workingDates: string[],
  hoursPerDay: number,
  maxWeeklyHours: number = 40,
): { minStaff: number; weeklyBreakdown: WeeklyHoursEntry[] } {
  if (workingDates.length === 0 || hoursPerDay <= 0) {
    return { minStaff: 1, weeklyBreakdown: [] };
  }

  // Group by year+week
  const weekMap = new Map<string, number>();
  for (const dateStr of workingDates) {
    const d = parseDate(dateStr);
    const { year, week } = getISOWeekYear(d);
    const key = weekKey(year, week);
    weekMap.set(key, (weekMap.get(key) || 0) + hoursPerDay);
  }

  const weeklyBreakdown: WeeklyHoursEntry[] = [];
  let maxWeekHours = 0;

  for (const [key, hours] of weekMap) {
    const [yStr, wStr] = key.split('-W');
    const entry: WeeklyHoursEntry = {
      weekKey: key,
      year: parseInt(yStr),
      week: parseInt(wStr),
      hours: Math.round(hours * 100) / 100,
    };
    weeklyBreakdown.push(entry);
    if (hours > maxWeekHours) maxWeekHours = hours;
  }

  weeklyBreakdown.sort((a, b) => a.weekKey.localeCompare(b.weekKey));

  // Criterio 1: horas semanales
  const hoursCriterion = Math.max(1, Math.ceil(maxWeekHours / maxWeeklyHours));

  // Criterio 2: descanso semanal (ET art. 37)
  // Se necesitan ≥2 personas si se cubren los 7 días de la semana
  // o si hay ≥7 días consecutivos (una persona necesita descanso).
  const uniqueDaysOfWeek = new Set<number>();
  for (const dateStr of workingDates) {
    uniqueDaysOfWeek.add(parseDate(dateStr).getDay());
  }
  const coversAll7Days = uniqueDaysOfWeek.size === 7;

  // Max consecutive days
  const sortedDates = [...workingDates].sort();
  let maxConsecutive = 1;
  let currentStreak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = parseDate(sortedDates[i - 1]);
    const curr = parseDate(sortedDates[i]);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      currentStreak++;
      maxConsecutive = Math.max(maxConsecutive, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  const needsRestRelief = coversAll7Days || maxConsecutive >= 7;
  const restCriterion = needsRestRelief ? 2 : 1;

  const minStaff = Math.max(hoursCriterion, restCriterion);
  return { minStaff, weeklyBreakdown };
}

// ─── 4. Labor Validation ─────────────────────────────────────────

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
  const warnings: LaborWarning[] = [];
  if (workingDates.length === 0) return warnings;

  const effectiveDailyHours = hoursPerDay - (shift.breakMinutes / 60);

  // Max daily hours
  if (effectiveDailyHours > maxDailyHours) {
    warnings.push({
      type: 'max_daily_exceeded',
      severity: 'error',
      message: `Turno de ${effectiveDailyHours}h excede el maximo de ${maxDailyHours}h diarias.`,
    });
  }

  // 24h shifts
  if (shift.shiftType === '24h') {
    warnings.push({
      type: '24h_shift',
      severity: 'warning',
      message: 'Turnos de 24 horas configurados. Verificar descanso minimo entre turnos.',
    });
  }

  // Night shift info
  if (shift.shiftType === 'night' || (shift.shiftType === 'custom' && shift.shiftStartTime && parseHHMM(shift.shiftStartTime) >= 22)) {
    warnings.push({
      type: 'night_shift',
      severity: 'info',
      message: 'Turno nocturno detectado. Se aplicara recargo de nocturnidad si esta configurado.',
    });
  }

  // Weekly hours per professional — grouped by year+week
  const weekMap = new Map<string, number>();
  for (const ds of workingDates) {
    const d = parseDate(ds);
    const { year, week } = getISOWeekYear(d);
    const key = weekKey(year, week);
    weekMap.set(key, (weekMap.get(key) || 0) + effectiveDailyHours);
  }

  for (const [key, weekHours] of weekMap) {
    const hoursPerPro = weekHours / plantillaSeleccionada;

    if (hoursPerPro > maxWeeklyHours) {
      const overtime = hoursPerPro - maxWeeklyHours;
      const needed = Math.ceil(weekHours / maxWeeklyHours);
      warnings.push({
        type: 'max_weekly_exceeded',
        severity: 'error',
        message: `Semana ${key}: ${hoursPerPro.toFixed(1)}h/profesional (max ${maxWeeklyHours}h). Exceso de ${overtime.toFixed(1)}h.`,
        weekKey: key,
        details: `Con ${plantillaSeleccionada} profesional(es), cada uno haria ${hoursPerPro.toFixed(1)}h semanales. Se necesitan al menos ${needed} profesional(es).`,
      });
    }

    if (hoursPerPro > maxWeeklyHours * 1.2) {
      warnings.push({
        type: 'overtime_needed',
        severity: 'warning',
        message: `Semana ${key}: Se requeririan muchas horas extra (${(hoursPerPro - maxWeeklyHours).toFixed(1)}h extra por profesional).`,
        weekKey: key,
      });
    }
  }

  // Consecutive days
  const sortedDates = [...workingDates].sort();
  let maxConsecutive = 1;
  let currentStreak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = parseDate(sortedDates[i - 1]);
    const curr = parseDate(sortedDates[i]);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
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

  // Rest violation
  if (effectiveDailyHours >= 12 || shift.shiftType === '24h') {
    warnings.push({
      type: 'rest_violation',
      severity: 'warning',
      message: `Con turnos de ${effectiveDailyHours.toFixed(1)}h, verificar descanso minimo de ${minRestHours}h entre turnos consecutivos.`,
    });
  }

  return warnings;
}

// ─── 5. Surcharge Calculation ────────────────────────────────────
// Automatic: nocturnidad, domingo, festivo*, fin_de_semana
// Opt-in (manual): urgencia, desplazamiento, dificil_cobertura, servicio_premium, municipio_especial, guardia_24h

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

  // A2 (corregido, multi-día): el marcado por día en calculateShiftHours YA es
  // mutuamente excluyente (un festivo no marca domingo ni weekend; un domingo no
  // marca weekend). Por tanto los buckets sunday/weekend/holiday* NO se solapan y
  // se usan DIRECTAMENTE. NO se restan horas agregadas: hacerlo mezclaba días
  // distintos (un festivo entre semana restaba horas a un domingo normal de otra
  // fecha) y anulaba recargos legítimos → infrafacturación.
  // El 'festivo' genérico cubre solo las horas de festivo NO cubiertas por un tipo
  // específico activo (auto o habilitado), evitando doble conteo festivo+específico.
  const especificoActivo = (t: SurchargeType, h: number): number => {
    const s = allSurcharges.find(x => x.type === t && x.value);
    if (!s) return 0;
    return (AUTO_SURCHARGE_TYPES.includes(t) || enabledSurcharges.includes(t)) ? h : 0;
  };

  for (const surcharge of allSurcharges) {
    if (!surcharge.value || surcharge.value === 0) continue;

    const isAuto = AUTO_SURCHARGE_TYPES.includes(surcharge.type);
    const isManualEnabled = enabledSurcharges.includes(surcharge.type);

    // Auto surcharges: apply if hours > 0
    // Manual surcharges: apply only if explicitly enabled
    if (isAuto && !isManualEnabled) {
      // auto-apply logic
    } else if (!isAuto && !isManualEnabled) {
      continue; // skip manual surcharges not enabled
    }

    let hours = 0;
    switch (surcharge.type) {
      case 'nocturnidad': hours = totalBreakdown.night; break;
      // A2 FIX: Use exclusive hours for special-day surcharges
      case 'domingo': hours = totalBreakdown.sunday; break;
      case 'festivo': {
        const specificH =
          especificoActivo('festivo_nacional', totalBreakdown.holidayNational) +
          especificoActivo('festivo_autonomico', totalBreakdown.holidayAutonomico) +
          especificoActivo('festivo_provincial', totalBreakdown.holidayProvincial) +
          especificoActivo('festivo_municipal', totalBreakdown.holidayMunicipal);
        hours = Math.max(0, totalBreakdown.holiday - specificH);
        break;
      }
      case 'festivo_nacional': hours = totalBreakdown.holidayNational; break;
      case 'festivo_autonomico': hours = totalBreakdown.holidayAutonomico; break;
      case 'festivo_provincial': hours = totalBreakdown.holidayProvincial; break;
      case 'festivo_municipal': hours = totalBreakdown.holidayMunicipal; break;
      case 'fin_de_semana': hours = totalBreakdown.weekend; break;
      // Manual surcharges apply to total hours
      case 'urgencia':
      case 'dificil_cobertura':
      case 'desplazamiento':
      case 'servicio_premium':
      case 'municipio_especial':
        hours = totalBreakdown.total;
        break;
      // A6 FIX: special_price usa horas totales (faltaba case)
      case 'special_price':
        hours = totalBreakdown.total;
        break;
      case 'guardia_24h':
        // Per-shift fixed amount, handled differently
        break;
      default: break;
    }

    if (hours <= 0) continue;

    let amount = 0;
    switch (surcharge.surchargeType) {
      case 'percentage':
        amount = (pricePerHour * hours) * (surcharge.value / 100);
        break;
      case 'fixed':
        amount = surcharge.value * hours;
        break;
      case 'multiplier':
        amount = (pricePerHour * hours) * (surcharge.value - 1);
        break;
      case 'special_price':
        amount = (surcharge.value - pricePerHour) * hours;
        break;
    }

    // A6 FIX: special_price permite importes negativos (descuentos de tarifa reducida).
    // El resto de recargos siguen filtrando negativos (amount > 0).
    const isSpecialPrice = surcharge.surchargeType === 'special_price';
    if ((isSpecialPrice && amount !== 0) || (!isSpecialPrice && amount > 0)) {
      entries.push({
        type: surcharge.type,
        name: surcharge.name,
        hours: Math.round(hours * 100) / 100,
        surchargeType: surcharge.surchargeType,
        value: surcharge.value,
        amount: Math.round(amount * 100) / 100,
      });
    }
  }

  return entries;
}

// ─── 6. Full Block Calculation ───────────────────────────────────

/** E6: Coerce any value to a finite number, falling back to default. */
function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

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

  // E6 FIX: Input guards — clamp numeric inputs to safe ranges
  const safeHPD = Math.max(0, toFiniteNumber(block.hoursPerDay, 0));
  const safeBreak = Math.max(0, toFiniteNumber(block.breakMinutes, 0));
  const safePlantilla = Math.max(1, Math.round(toFiniteNumber(block.plantillaSeleccionada, 0)));

  // E6: Validate date range (inverted → empty dates → 0 result)
  if (block.dateMode === 'range' && block.dateRangeStart && block.dateRangeEnd) {
    if (block.dateRangeEnd < block.dateRangeStart) {
      return {
        workingDates: [], totalWorkingDays: 0, hoursPerPosition: 0,
        coverageHours: 0, totalHours: 0,
        shiftBreakdown: { total: 0, regular: 0, night: 0, sunday: 0, holiday: 0, holidayNational: 0, holidayAutonomico: 0, holidayProvincial: 0, holidayMunicipal: 0, weekend: 0 },
        surcharges: [], totalSurcharges: 0, puestosSimultaneos: Math.max(1, Math.round(toFiniteNumber(block.puestosSimultaneos, 1))),
        plantillaMinimaRecomendada: 1, plantillaSeleccionada: safePlantilla, deficitPlantilla: 0,
        weeklyHoursPerPro: [], overtimeHours: 0, laborWarnings: [],
        subtotal: 0, totalWithSurcharges: 0,
      };
    }
  }

  // E5 FIX: Explicit simple-block routing.
  // A block is "simple" (price × quantity, no dates/shifts) when:
  //   - blockType is a non-temporal category: material, desplazamiento, dietas,
  //     alojamiento, ambulancia, telemedicina, curso, otros, servicio_fijo
  //   - OR unitType is servicio/kilometro/unidad (always simple)
  // Everything else (hora, turno, dia with profesional_hora) goes to temporal calc.
  const SIMPLE_BLOCK_TYPES = new Set([
    'material', 'desplazamiento', 'dietas', 'alojamiento', 'ambulancia',
    'telemedicina', 'curso', 'otros', 'servicio_fijo',
  ]);
  const SIMPLE_UNIT_TYPES = new Set(['servicio', 'kilometro', 'unidad']);

  const isSimpleBlock = SIMPLE_BLOCK_TYPES.has(block.blockType || '')
    || (SIMPLE_UNIT_TYPES.has(block.unitType) && block.unitType !== 'dia');

  if (isSimpleBlock) {
    // Special handling for accommodation: nights × persons × price per night
    let subtotal: number;
    let effectiveQuantity: number;
    
    if (block.blockType === 'alojamiento') {
      const nights = block.accommodationNights || block.quantity || 1;
      const persons = block.accommodationPersons || 1;
      const pricePerNight = block.fixedPrice || block.pricePerHour;
      effectiveQuantity = nights * persons;
      subtotal = pricePerNight * effectiveQuantity;
    } else {
      const basePrice = block.fixedPrice || block.pricePerHour;
      effectiveQuantity = block.quantity || 1;
      subtotal = basePrice * effectiveQuantity;
    }
    
    subtotal = Math.round(subtotal * 100) / 100;
    
    return {
      workingDates: [],
      totalWorkingDays: 0,
      hoursPerPosition: effectiveQuantity,
      coverageHours: effectiveQuantity,
      totalHours: 0,
      shiftBreakdown: { total: 0, regular: 0, night: 0, sunday: 0, holiday: 0, holidayNational: 0, holidayAutonomico: 0, holidayProvincial: 0, holidayMunicipal: 0, weekend: 0 },
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

  // 1. Calculate working dates
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

  // 2. Calculate shift hours per date, aggregate per-position breakdown
  const posBreakdown: ShiftHourBreakdown = {
    total: 0, regular: 0, night: 0, sunday: 0, holiday: 0,
    holidayNational: 0, holidayAutonomico: 0, holidayProvincial: 0, holidayMunicipal: 0, weekend: 0,
  };

  for (const dateStr of workingDates) {
    const dayBD = calculateShiftHours(
      { shiftType: block.shiftType as any, shiftStartTime: block.shiftStartTime, shiftEndTime: block.shiftEndTime, hoursPerDay: safeHPD, breakMinutes: safeBreak },
      dateStr, holidays, laborRules.nightStartHour, laborRules.nightEndHour,
    );
    posBreakdown.total += dayBD.total;
    posBreakdown.regular += dayBD.regular;
    posBreakdown.night += dayBD.night;
    posBreakdown.sunday += dayBD.sunday;
    posBreakdown.holiday += dayBD.holiday;
    posBreakdown.holidayNational += dayBD.holidayNational;
    posBreakdown.holidayAutonomico += dayBD.holidayAutonomico;
    posBreakdown.holidayProvincial += dayBD.holidayProvincial;
    posBreakdown.holidayMunicipal += dayBD.holidayMunicipal;
    posBreakdown.weekend += dayBD.weekend;
  }

  // E2 FIX: Do NOT round per-position hours. Keep full precision internally.
  // Only round monetary amounts (subtotal, surcharges, totals) at the end.

  // 3. Key metrics
  const puestosSimultaneos = Math.max(1, Math.round(toFiniteNumber(block.puestosSimultaneos, 1)));
  const hoursPerPosition = posBreakdown.total;
  const coverageHours = hoursPerPosition * puestosSimultaneos;

  // 4. Plantilla minima recomendada (based on per-position hours)
  const effectiveHPD = Math.max(0, safeHPD - (safeBreak / 60));
  const { minStaff, weeklyBreakdown } = calculateMinStaff(
    workingDates, effectiveHPD, laborRules.maxWeeklyHours,
  );

  const plantillaSeleccionada = safePlantilla || minStaff;
  const deficitPlantilla = Math.max(0, minStaff - plantillaSeleccionada);

  // 5. Labor warnings (uses plantillaSeleccionada for per-professional hours)
  const laborWarnings = validateLaborRules(
    workingDates, effectiveHPD,
    { shiftType: block.shiftType as any, shiftStartTime: block.shiftStartTime, shiftEndTime: block.shiftEndTime, hoursPerDay: safeHPD, breakMinutes: safeBreak },
    plantillaSeleccionada, puestosSimultaneos,
    laborRules.maxWeeklyHours, laborRules.maxDailyHours, laborRules.maxConsecutiveDays, laborRules.minRestBetweenShiftsH,
  );

  // Staff deficit warning
  if (deficitPlantilla > 0) {
    laborWarnings.push({
      type: 'staff_deficit',
      severity: 'warning',
      message: `Plantilla seleccionada (${plantillaSeleccionada}) es inferior a la minima recomendada (${minStaff}). Deficit de ${deficitPlantilla} profesional(es).`,
      details: `Se necesitarian ${minStaff} profesionales para cubrir sin horas extra. Con ${plantillaSeleccionada}, habra horas extra estimadas.`,
    });
  }

  // 6. Overtime calculation
  let overtimeHours = 0;
  if (plantillaSeleccionada < minStaff) {
    for (const w of weeklyBreakdown) {
      const perPro = w.hours / plantillaSeleccionada;
      if (perPro > laborRules.maxWeeklyHours) {
        overtimeHours += perPro - laborRules.maxWeeklyHours;
      }
    }
  }
  overtimeHours = Math.round(overtimeHours * 100) / 100;

  // 7. Surcharges (on coverage hours = per-position breakdown × puestos)
  // E2 FIX: Use unrounded posBreakdown × puestos for coverage hours (no intermediate rounding)
  const coverageBreakdown: ShiftHourBreakdown = { ...posBreakdown };
  for (const k of Object.keys(coverageBreakdown) as (keyof ShiftHourBreakdown)[]) {
    coverageBreakdown[k] = posBreakdown[k] * puestosSimultaneos;
  }

  const surchargeEntries = calculateSurcharges(
    coverageBreakdown, surcharges, block.pricePerHour, block.enabledSurcharges || [],
  );
  const totalSurcharges = surchargeEntries.reduce((sum, s) => sum + s.amount, 0);

  // 8. Subtotal: horasCobertura × precioHora
  // E2 FIX: Use unrounded hoursBase, same base as surcharges
  // E6 FIX: Clamp pricePerHour to non-negative
  const safePrice = Math.max(0, toFiniteNumber(block.pricePerHour, 0));
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
    totalSurcharges: Math.round(totalSurcharges * 100) / 100,
    puestosSimultaneos,
    plantillaMinimaRecomendada: minStaff,
    plantillaSeleccionada,
    deficitPlantilla,
    weeklyHoursPerPro: weeklyBreakdown,
    overtimeHours,
    laborWarnings,
    subtotal: Math.round(subtotal * 100) / 100,
    totalWithSurcharges: Math.round(totalWithSurcharges * 100) / 100,
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
  const cleanDiscount = Math.min(Math.max(toFiniteNumber(discountPercent), 0), 100);
  // E3 FIX: Clamp IVA to [0, 100] to prevent typos like 2100%
  const cleanIva = Math.min(Math.max(toFiniteNumber(ivaPercent, 21), 0), 100);

  const baseForDiscount = subtotal + totalSurcharges;
  const discountAmount = baseForDiscount * (cleanDiscount / 100);
  const afterDiscount = Math.max(baseForDiscount - discountAmount, 0);
  const ivaAmount = afterDiscount * (cleanIva / 100);
  const totalFinal = afterDiscount + ivaAmount;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    totalSurcharges: Math.round(totalSurcharges * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    ivaAmount: Math.round(ivaAmount * 100) / 100,
    totalFinal: Math.round(totalFinal * 100) / 100,
  };
}