// ─── Bug Reproduction Tests for Calculation Engine ──────────
// Each describe block targets one bug. Tests MUST FAIL before the fix
// and PASS after the fix.

import { describe, it, expect } from 'vitest';
import {
  calculateShiftHours,
  findHolidayForDate,
  calculateSurcharges,
  calculateServiceBlock,
  calculateMinStaff,
  validateLaborRules,
  calculateBudgetTotals,
} from '@/lib/schedule-engine';
import type {
  HolidayInfo, SurchargeType, SurchargeKind, ShiftHourBreakdown,
} from '@/lib/types';

// ════════════════════════════════════════════════════════════════
// A1 (CRÍTICO) — Turnos de 24h facturan ~8h en vez de 24h
// ════════════════════════════════════════════════════════════════
describe('A1 — 24h shift must cover total hours (not just night)', () => {
  const defaultHolidays: HolidayInfo[] = [];
  const nightStart = 22;
  const nightEnd = 6;

  it('24h shift: regular + night must equal total', () => {
    const result = calculateShiftHours(
      { shiftType: '24h', hoursPerDay: 24, breakMinutes: 0 },
      '2026-07-13', // Monday
      defaultHolidays, nightStart, nightEnd,
    );
    expect(result.total).toBe(24);
    expect(result.night).toBe(8); // (24-22)+6 = 8
    expect(result.regular).toBe(16); // 24 - 8 = 16
    expect(result.regular + result.night).toBeCloseTo(result.total, 5);
  });

  it('24h shift with break: regular + night = total', () => {
    const result = calculateShiftHours(
      { shiftType: '24h', hoursPerDay: 24, breakMinutes: 60 },
      '2026-07-13',
      defaultHolidays, nightStart, nightEnd,
    );
    expect(result.total).toBe(23); // 24 - 1h break
    // E1 FIX: break distributed uniformly → night = 8/24 * 23 = 7.6667
    expect(result.night).toBeCloseTo(23 * (8 / 24), 10);
    expect(result.regular + result.night).toBeCloseTo(result.total, 5);
  });

  it('full block: 24h, 10 days, 30€/h, 1 puesto → subtotal = 7,200€', () => {
    // 10 weekdays: July 6-15, 2026 (Mon-Mon, no holidays, no sunday exclusion)
    const dates = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(2026, 6, 6 + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const result = calculateServiceBlock({
      block: {
        serviceName: 'Enfermería 24h',
        professionalCategory: 'Enfermería',
        puestosSimultaneos: 1,
        pricePerHour: 30,
        dateMode: 'specific',
        specificDates: dates,
        excludeSundays: false,
        excludeHolidays: true,
        shiftType: '24h',
        hoursPerDay: 24,
        breakMinutes: 0,
        unitType: 'hora',
        quantity: 1,
      },
      holidays: [],
      surcharges: [],
      laborRules: {
        maxWeeklyHours: 40, maxDailyHours: 12,
        minRestBetweenShiftsH: 11, maxConsecutiveDays: 6,
        nightStartHour: 22, nightEndHour: 6,
      },
    });
    // 10 days × 24h × 30€/h = 7,200€
    expect(result.subtotal).toBe(7200);
    expect(result.hoursPerPosition).toBe(240);
  });
});

// ════════════════════════════════════════════════════════════════
// A2 (CRÍTICO) — Solapamiento de recargos sobre las mismas horas
// ════════════════════════════════════════════════════════════════
describe('A2 — No double/triple surcharges for same hours', () => {
  it('Sunday + national holiday: only festivo_nacional applies (75% = 180€)', () => {
    // A Sunday that is also a national holiday, 8h at 30€/h
    // With the old code: domingo(60) + fin_de_semana(60) + festivo(180) + festivo_nacional(180) = 480€
    // With the fix: only festivo_nacional = 75% of 240 = 180€
    // Breakdown REALISTA: calculateShiftHours marca en exclusiva. Un festivo NO
    // marca sunday ni weekend, así que un domingo-festivo llega con holiday=8 y
    // sunday=weekend=0. La exclusión mutua vive en calculateShiftHours (por día),
    // NO en una resta agregada en calculateSurcharges (que rompía el multi-día).
    const breakdown: ShiftHourBreakdown = {
      total: 8, regular: 8, night: 0,
      sunday: 0, holiday: 8,
      holidayNational: 8, holidayAutonomico: 0,
      holidayProvincial: 0, holidayMunicipal: 0,
      weekend: 0,
    };
    const surcharges: { type: SurchargeType; name: string; surchargeType: SurchargeKind; value: number }[] = [
      { type: 'domingo', name: 'Dominical', surchargeType: 'percentage', value: 25 },
      { type: 'fin_de_semana', name: 'Fin de semana', surchargeType: 'percentage', value: 25 },
      { type: 'festivo', name: 'Festivo', surchargeType: 'percentage', value: 75 },
      { type: 'festivo_nacional', name: 'Festivo Nacional', surchargeType: 'percentage', value: 75 },
      { type: 'nocturnidad', name: 'Nocturnidad', surchargeType: 'percentage', value: 25 },
    ];
    const entries = calculateSurcharges(
      breakdown, surcharges, 30,
      ['domingo', 'fin_de_semana', 'festivo', 'festivo_nacional', 'nocturnidad'],
    );
    const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
    // Nocturnidad = 0 (night=0). Only festivo_nacional = 75% of 240 = 180
    expect(totalAmount).toBe(180);
    // Verify no domingo or fin_de_semana surcharge applied
    expect(entries.find(e => e.type === 'domingo')).toBeUndefined();
    expect(entries.find(e => e.type === 'fin_de_semana')).toBeUndefined();
  });

  it('Regular Sunday (no holiday): only domingo applies (25% = 60€)', () => {
    const breakdown: ShiftHourBreakdown = {
      total: 8, regular: 8, night: 0,
      sunday: 8, holiday: 0,
      holidayNational: 0, holidayAutonomico: 0,
      holidayProvincial: 0, holidayMunicipal: 0,
      weekend: 0, // un domingo se marca solo como domingo (exclusivo)
    };
    const surcharges = [
      { type: 'domingo' as SurchargeType, name: 'Dominical', surchargeType: 'percentage' as SurchargeKind, value: 25 },
      { type: 'fin_de_semana' as SurchargeType, name: 'Fin de semana', surchargeType: 'percentage' as SurchargeKind, value: 25 },
    ];
    const entries = calculateSurcharges(
      breakdown, surcharges, 30,
      ['domingo', 'fin_de_semana'],
    );
    const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
    // Only domingo: 25% of (30*8) = 60
    expect(totalAmount).toBe(60);
    expect(entries.find(e => e.type === 'fin_de_semana')).toBeUndefined();
  });

  it('Saturday (no holiday): only fin_de_semana applies', () => {
    const breakdown: ShiftHourBreakdown = {
      total: 8, regular: 8, night: 0,
      sunday: 0, holiday: 0,
      holidayNational: 0, holidayAutonomico: 0,
      holidayProvincial: 0, holidayMunicipal: 0,
      weekend: 8,
    };
    const surcharges = [
      { type: 'domingo' as SurchargeType, name: 'Dominical', surchargeType: 'percentage' as SurchargeKind, value: 25 },
      { type: 'fin_de_semana' as SurchargeType, name: 'Fin de semana', surchargeType: 'percentage' as SurchargeKind, value: 25 },
    ];
    const entries = calculateSurcharges(
      breakdown, surcharges, 30,
      ['domingo', 'fin_de_semana'],
    );
    const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
    // Only fin_de_semana: 25% of (30*8) = 60
    expect(totalAmount).toBe(60);
  });

  it('Nocturnidad IS additive on top of special-day surcharge', () => {
    // Sunday + national holiday + night hours
    // festivo_nacional applies for the day, nocturnidad adds on top
    const breakdown: ShiftHourBreakdown = {
      total: 8, regular: 4, night: 4,
      sunday: 8, holiday: 8,
      holidayNational: 8, holidayAutonomico: 0,
      holidayProvincial: 0, holidayMunicipal: 0,
      weekend: 8,
    };
    const surcharges = [
      { type: 'festivo_nacional' as SurchargeType, name: 'Festivo Nacional', surchargeType: 'percentage' as SurchargeKind, value: 75 },
      { type: 'nocturnidad' as SurchargeType, name: 'Nocturnidad', surchargeType: 'percentage' as SurchargeKind, value: 25 },
    ];
    const entries = calculateSurcharges(
      breakdown, surcharges, 30,
      ['festivo_nacional', 'nocturnidad'],
    );
    const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
    // festivo_nacional: 75% of (30*8) = 180
    // nocturnidad: 25% of (30*4) = 30
    expect(totalAmount).toBe(210);
  });
});

// ════════════════════════════════════════════════════════════════
// A3 (ALTO) — findHolidayForDate ignora el año
// ════════════════════════════════════════════════════════════════
describe('A3 — Holiday matching must use full date (year-month-day)', () => {
  it('2026-04-02 (Jueves Santo) must NOT match 2027-04-02', () => {
    const holidays: HolidayInfo[] = [
      { date: '2026-04-02', name: 'Jueves Santo 2026', type: 'nacional' },
    ];
    // Same year → match
    expect(findHolidayForDate('2026-04-02', holidays)?.name).toBe('Jueves Santo 2026');
    // Different year, same month-day → must NOT match
    expect(findHolidayForDate('2027-04-02', holidays)).toBeNull();
  });

  it('Fixed holiday with recurring=true must match across years', () => {
    const holidays: HolidayInfo[] = [
      { date: '2026-01-01', name: 'Año Nuevo', type: 'nacional', recurring: true },
    ];
    // Same year
    expect(findHolidayForDate('2026-01-01', holidays)?.name).toBe('Año Nuevo');
    // Different year, same month-day, recurring → must match
    expect(findHolidayForDate('2027-01-01', holidays)?.name).toBe('Año Nuevo');
    expect(findHolidayForDate('2028-01-01', holidays)?.name).toBe('Año Nuevo');
  });

  it('Non-recurring holiday must only match exact date', () => {
    const holidays: HolidayInfo[] = [
      { date: '2026-04-02', name: 'Jueves Santo 2026', type: 'nacional' },
    ];
    // recurring is undefined (falsy) → no cross-year match
    expect(findHolidayForDate('2025-04-02', holidays)).toBeNull();
    expect(findHolidayForDate('2028-04-02', holidays)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════
// A4 (ALTO) — Nocturnidad mal contada en turnos que tocan ambas
//              franjas noche sin cruzar medianoche
// ════════════════════════════════════════════════════════════════
describe('A4 — Night hours must sum both windows when shift spans both', () => {
  const holidays: HolidayInfo[] = [];
  const nightStart = 22;
  const nightEnd = 6;

  it('05:00–23:00 (18h) → night = 2h (05-06 and 22-23)', () => {
    const result = calculateShiftHours(
      { shiftType: 'custom', shiftStartTime: '05:00', shiftEndTime: '23:00', hoursPerDay: 18, breakMinutes: 0 },
      '2026-07-13', // Monday
      holidays, nightStart, nightEnd,
    );
    expect(result.total).toBe(18);
    expect(result.night).toBe(2);
    expect(result.regular).toBe(16);
  });

  it('21:00–23:00 (2h) → night = 1h (22-23)', () => {
    const result = calculateShiftHours(
      { shiftType: 'custom', shiftStartTime: '21:00', shiftEndTime: '23:00', hoursPerDay: 2, breakMinutes: 0 },
      '2026-07-13',
      holidays, nightStart, nightEnd,
    );
    expect(result.total).toBe(2);
    expect(result.night).toBe(1);
    expect(result.regular).toBe(1);
  });

  it('05:00–08:00 (3h) → night = 1h (05-06)', () => {
    const result = calculateShiftHours(
      { shiftType: 'custom', shiftStartTime: '05:00', shiftEndTime: '08:00', hoursPerDay: 3, breakMinutes: 0 },
      '2026-07-13',
      holidays, nightStart, nightEnd,
    );
    expect(result.total).toBe(3);
    expect(result.night).toBe(1);
    expect(result.regular).toBe(2);
  });

  it('22:00–06:00 (crosses midnight) → night = 8h (unchanged behavior)', () => {
    const result = calculateShiftHours(
      { shiftType: 'custom', shiftStartTime: '22:00', shiftEndTime: '06:00', hoursPerDay: 8, breakMinutes: 0 },
      '2026-07-13',
      holidays, nightStart, nightEnd,
    );
    expect(result.total).toBe(8);
    expect(result.night).toBe(8);
    expect(result.regular).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// A5 (MEDIO) — Turno 'night' cuenta 100% como nocturno
// ════════════════════════════════════════════════════════════════
describe('A5 — Night shift must calculate real night hours, not assume 100%', () => {
  const holidays: HolidayInfo[] = [];
  const nightStart = 22;
  const nightEnd = 6;

  it('night shift 20:00–08:00 (12h) → night = 8h, regular = 4h', () => {
    const result = calculateShiftHours(
      { shiftType: 'night', shiftStartTime: '20:00', shiftEndTime: '08:00', hoursPerDay: 12, breakMinutes: 0 },
      '2026-07-13',
      holidays, nightStart, nightEnd,
    );
    expect(result.total).toBe(12);
    // Night: 22-24 (2h) + 0-6 (6h) = 8h
    expect(result.night).toBe(8);
    expect(result.regular).toBe(4);
    expect(result.regular + result.night).toBeCloseTo(result.total, 5);
  });

  it('night shift 22:00–06:00 (8h) → night = 8h, regular = 0h (all night)', () => {
    const result = calculateShiftHours(
      { shiftType: 'night', shiftStartTime: '22:00', shiftEndTime: '06:00', hoursPerDay: 8, breakMinutes: 0 },
      '2026-07-13',
      holidays, nightStart, nightEnd,
    );
    expect(result.total).toBe(8);
    expect(result.night).toBe(8);
    expect(result.regular).toBe(0);
  });

  it('night shift without start/end times → keeps current behavior (all night)', () => {
    const result = calculateShiftHours(
      { shiftType: 'night', hoursPerDay: 8, breakMinutes: 0 },
      '2026-07-13',
      holidays, nightStart, nightEnd,
    );
    expect(result.total).toBe(8);
    // No start/end times → assume all hours are night (safe default)
    expect(result.night).toBe(8);
    expect(result.regular).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// A6 (MEDIO) — special_price inferior al base se descarta
// ════════════════════════════════════════════════════════════════
describe('A6 — special_price below base price must apply as discount', () => {
  it('special_price 20€ with base 30€ → negative amount (discount) must be included', () => {
    const breakdown: ShiftHourBreakdown = {
      total: 8, regular: 8, night: 0,
      sunday: 0, holiday: 0,
      holidayNational: 0, holidayAutonomico: 0,
      holidayProvincial: 0, holidayMunicipal: 0,
      weekend: 0,
    };
    const surcharges: { type: SurchargeType; name: string; surchargeType: SurchargeKind; value: number }[] = [
      {
        type: 'special_price',
        name: 'Tarifa reducida',
        surchargeType: 'special_price',
        value: 20, // 20€/h vs 30€/h base
      },
    ];
    const entries = calculateSurcharges(
      breakdown, surcharges, 30,
      ['special_price'],
    );
    expect(entries.length).toBe(1);
    expect(entries[0].amount).toBe(-80); // (20 - 30) * 8 = -80
  });

  it('special_price above base → positive amount works as before', () => {
    const breakdown: ShiftHourBreakdown = {
      total: 8, regular: 8, night: 0,
      sunday: 0, holiday: 0,
      holidayNational: 0, holidayAutonomico: 0,
      holidayProvincial: 0, holidayMunicipal: 0,
      weekend: 0,
    };
    const surcharges: { type: SurchargeType; name: string; surchargeType: SurchargeKind; value: number }[] = [
      {
        type: 'special_price',
        name: 'Tarifa premium',
        surchargeType: 'special_price',
        value: 40, // 40€/h vs 30€/h base
      },
    ];
    const entries = calculateSurcharges(
      breakdown, surcharges, 30,
      ['special_price'],
    );
    expect(entries.length).toBe(1);
    expect(entries[0].amount).toBe(80); // (40 - 30) * 8 = 80
  });

  it('Non-special_price surcharges still filter negative amounts', () => {
    const breakdown: ShiftHourBreakdown = {
      total: 8, regular: 8, night: 0,
      sunday: 0, holiday: 0,
      holidayNational: 0, holidayAutonomico: 0,
      holidayProvincial: 0, holidayMunicipal: 0,
      weekend: 0,
    };
    const surcharges = [
      {
        type: 'nocturnidad' as SurchargeType,
        name: 'Nocturnidad',
        surchargeType: 'percentage' as SurchargeKind,
        value: -10, // Negative percentage → should be filtered out
      },
    ];
    const entries = calculateSurcharges(
      breakdown, surcharges, 30,
      ['nocturnidad'],
    );
    // night=0 anyway, but even if night>0, negative amount should be filtered
    expect(entries.length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// B1 — Plantilla mínima por DOS criterios (horas + descanso)
// ════════════════════════════════════════════════════════════════
describe('B1 — Min staff must consider both hours AND weekly rest', () => {
  // Helper: generate N consecutive dates starting from a Monday
  function consecutiveDates(startStr: string, n: number): string[] {
    const dates: string[] = [];
    const d = new Date(startStr + 'T12:00:00');
    for (let i = 0; i < n; i++) {
      const dd = new Date(d);
      dd.setDate(dd.getDate() + i);
      dates.push(dd.toISOString().slice(0, 10));
    }
    return dates;
  }

  it('7 consecutive days, 5h/day, maxWeekly=40 → needs 2 (rest criterion, not hours)', () => {
    // Hours criterion: ceil(35/40) = 1. But 7 days straight → rest criterion = 2.
    const dates = consecutiveDates('2026-07-06', 7); // Mon-Sun
    const { minStaff } = calculateMinStaff(dates, 5, 40);
    expect(minStaff).toBe(2);
  });

  it('Covers all 7 days of week (non-consecutive), 4h/day → needs 2', () => {
    // Scatter 7 days across 2 weeks covering Mon-Sun: e.g. Mon-Wed in week 1, Thu-Sun in week 2
    // Unique days of week = {0,1,2,3,4,5,6} = all 7 → rest criterion = 2
    // Hours per week: 3×4=12 and 4×4=16 → max=16 → ceil(16/40)=1
    const dates = [
      '2026-07-06', '2026-07-07', '2026-07-08',       // Mon, Tue, Wed (week 27)
      '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19', // Thu, Fri, Sat, Sun (week 29)
    ];
    const { minStaff } = calculateMinStaff(dates, 4, 40);
    expect(minStaff).toBe(2);
  });

  it('Only 5 weekdays, 8h/day → needs 1 (no rest issue, hours fit)', () => {
    const dates = consecutiveDates('2026-07-06', 5); // Mon-Fri
    const { minStaff } = calculateMinStaff(dates, 8, 40);
    // Hours: 5×8=40 → ceil(40/40)=1. Max consecutive=5 ≤ 6. Days of week=5 < 7.
    expect(minStaff).toBe(1);
  });

  it('6 consecutive days, 7h/day → needs 2 (hours: 42/40=2, rest: 6<7 so 1) → max=2', () => {
    const dates = consecutiveDates('2026-07-06', 6); // Mon-Sat
    const { minStaff } = calculateMinStaff(dates, 7, 40);
    // Hours: 6×7=42 → ceil(42/40)=2. Consecutive=6 < 7. Days of week=6 < 7.
    expect(minStaff).toBe(2);
  });

  it('7 consecutive days, 8h/day → needs 2 (both criteria give 2)', () => {
    const dates = consecutiveDates('2026-07-06', 7);
    const { minStaff } = calculateMinStaff(dates, 8, 40);
    // Hours: 7×8=56 → ceil(56/40)=2. Rest: 7 consecutive → 2. max(2,2)=2.
    expect(minStaff).toBe(2);
  });

  it('Empty dates → returns 1', () => {
    const { minStaff } = calculateMinStaff([], 8, 40);
    expect(minStaff).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════
// B2 — puestosSimultaneos vs plantillaSeleccionada (precio)
// ════════════════════════════════════════════════════════════════
describe('B2 — puestosSimultaneos multiplies price; plantillaSeleccionada does NOT', () => {
  const laborRules = {
    maxWeeklyHours: 40, maxDailyHours: 12,
    minRestBetweenShiftsH: 11, maxConsecutiveDays: 6,
    nightStartHour: 22, nightEndHour: 6,
  };

  it('1 puesto, 2 personas rotación → same subtotal as 1 persona', () => {
    // 5 weekdays, morning 8h, 30€/h
    const dates = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(2026, 6, 6 + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    const r1 = calculateServiceBlock({
      block: {
        serviceName: 'Enf', professionalCategory: 'Enf',
        puestosSimultaneos: 1, plantillaSeleccionada: 1,
        pricePerHour: 30, dateMode: 'specific', specificDates: dates,
        excludeSundays: true, excludeHolidays: false,
        shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
        unitType: 'hora', quantity: 1,
      },
      holidays: [], surcharges: [], laborRules,
    });

    const r2 = calculateServiceBlock({
      block: {
        serviceName: 'Enf', professionalCategory: 'Enf',
        puestosSimultaneos: 1, plantillaSeleccionada: 2,
        pricePerHour: 30, dateMode: 'specific', specificDates: dates,
        excludeSundays: true, excludeHolidays: false,
        shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
        unitType: 'hora', quantity: 1,
      },
      holidays: [], surcharges: [], laborRules,
    });

    // Same subtotal (price should NOT change with plantilla)
    expect(r1.subtotal).toBe(r2.subtotal);
    expect(r1.subtotal).toBe(1200); // 5 × 8h × 30€
    // Same coverage hours
    expect(r1.coverageHours).toBe(r2.coverageHours);
    // Different minStaff (r2 selected 2, no deficit)
    expect(r1.plantillaMinimaRecomendada).toBe(1);
    expect(r2.plantillaSeleccionada).toBe(2);
  });

  it('2 puestos simultáneos → double coverage hours and double subtotal', () => {
    const dates = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'];

    const r1 = calculateServiceBlock({
      block: {
        serviceName: 'Enf', professionalCategory: 'Enf',
        puestosSimultaneos: 1, plantillaSeleccionada: 1,
        pricePerHour: 30, dateMode: 'specific', specificDates: dates,
        excludeSundays: true, excludeHolidays: false,
        shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
        unitType: 'hora', quantity: 1,
      },
      holidays: [], surcharges: [], laborRules,
    });

    const r2 = calculateServiceBlock({
      block: {
        serviceName: 'Enf', professionalCategory: 'Enf',
        puestosSimultaneos: 2, plantillaSeleccionada: 1,
        pricePerHour: 30, dateMode: 'specific', specificDates: dates,
        excludeSundays: true, excludeHolidays: false,
        shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
        unitType: 'hora', quantity: 1,
      },
      holidays: [], surcharges: [], laborRules,
    });

    expect(r2.coverageHours).toBe(r1.coverageHours * 2);
    expect(r2.subtotal).toBe(r1.subtotal * 2);
    expect(r1.subtotal).toBe(1200);
    expect(r2.subtotal).toBe(2400);
  });
});

// ════════════════════════════════════════════════════════════════
// B3 — validateLaborRules: avisos claros con nº exacto de personas
// ════════════════════════════════════════════════════════════════
describe('B3 — Labor warnings include exact person counts', () => {
  const shift: import('@/lib/types').ShiftConfig = {
    shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
  };

  it('Weekly excess: message says exact number of professionals needed', () => {
    // 5 days × 12h = 60h/week with 1 person → needs ceil(60/40)=2
    const dates = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'];
    const warnings = validateLaborRules(dates, 12, shift, 1, 1, 40);
    const weekErr = warnings.find(w => w.type === 'max_weekly_exceeded');
    expect(weekErr).toBeDefined();
    expect(weekErr!.severity).toBe('error');
    // Must mention "2" (the number of professionals needed)
    expect(weekErr!.details).toContain('2');
    expect(weekErr!.message).toContain('60.0');
  });

  it('No deficit warning when plantilla is sufficient', () => {
    const dates = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'];
    const warnings = validateLaborRules(dates, 8, shift, 2, 1, 40);
    expect(warnings.find(w => w.type === 'max_weekly_exceeded')).toBeUndefined();
  });

  it('Consecutive days > maxConsecutiveDays: warning includes streak length', () => {
    // 7 consecutive days with maxConsecutiveDays=6
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2026, 6, 6 + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const warnings = validateLaborRules(dates, 8, shift, 2, 1, 40, 12, 6);
    const cont = warnings.find(w => w.type === 'continuous_coverage');
    expect(cont).toBeDefined();
    expect(cont!.severity).toBe('warning');
    expect(cont!.message).toContain('7');
  });

  it('Shifts ≥12h or 24h: rest warning with exact hours', () => {
    const shift12: import('@/lib/types').ShiftConfig = {
      shiftType: 'morning', hoursPerDay: 12, breakMinutes: 0,
    };
    const dates = ['2026-07-06'];
    const warnings = validateLaborRules(dates, 12, shift12, 1, 1, 40, 12, 6, 11);
    const rest = warnings.find(w => w.type === 'rest_violation');
    expect(rest).toBeDefined();
    expect(rest!.severity).toBe('warning');
    expect(rest!.message).toContain('12.0');
    expect(rest!.message).toContain('11');
  });

  it('24h shift produces both 24h_shift and rest_violation warnings', () => {
    const shift24: import('@/lib/types').ShiftConfig = {
      shiftType: '24h', hoursPerDay: 24, breakMinutes: 0,
    };
    const dates = ['2026-07-06'];
    const warnings = validateLaborRules(dates, 24, shift24, 1, 1, 40, 12, 6, 11);
    expect(warnings.find(w => w.type === '24h_shift')).toBeDefined();
    expect(warnings.find(w => w.type === 'rest_violation')).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════════
// D2 — IVA Exento: ivaPercent=0 debe dar ivaAmount=0
// ════════════════════════════════════════════════════════════════
describe('D2 — IVA Exento: 0% IVA yields zero ivaAmount', () => {
  it('ivaPercent=0 → ivaAmount is 0, totalFinal equals base after discount', () => {
    const block: import('@/lib/types').BlockCalculationResult = {
      workingDates: ['2026-07-13'],
      totalWorkingDays: 1,
      hoursPerPosition: 8,
      coverageHours: 8,
      totalHours: 8,
      shiftBreakdown: { total: 8, regular: 8, night: 0, sunday: 0, holiday: 0, holidayNational: 0, holidayAutonomico: 0, holidayProvincial: 0, holidayMunicipal: 0, weekend: 0 },
      surcharges: [],
      totalSurcharges: 0,
      puestosSimultaneos: 1,
      plantillaMinimaRecomendada: 1,
      plantillaSeleccionada: 1,
      deficitPlantilla: 0,
      weeklyHoursPerPro: [],
      overtimeHours: 0,
      laborWarnings: [],
      subtotal: 1000,
      totalWithSurcharges: 1000,
    };
    const result = calculateBudgetTotals([block], 0, 0);
    // subtotal=1000, surcharges=0, discount=0 → base=1000
    // iva=0% → ivaAmount=0, totalFinal=1000
    expect(result.ivaAmount).toBe(0);
    expect(result.totalFinal).toBe(1000);
    expect(result.subtotal).toBe(1000);
    expect(result.discountAmount).toBe(0);
  });

  it('ivaPercent=0 with 10% discount → ivaAmount=0, totalFinal=900', () => {
    const block: import('@/lib/types').BlockCalculationResult = {
      workingDates: ['2026-07-13'],
      totalWorkingDays: 1,
      hoursPerPosition: 8,
      coverageHours: 8,
      totalHours: 8,
      shiftBreakdown: { total: 8, regular: 8, night: 0, sunday: 0, holiday: 0, holidayNational: 0, holidayAutonomico: 0, holidayProvincial: 0, holidayMunicipal: 0, weekend: 0 },
      surcharges: [],
      totalSurcharges: 200,
      puestosSimultaneos: 1,
      plantillaMinimaRecomendada: 1,
      plantillaSeleccionada: 1,
      deficitPlantilla: 0,
      weeklyHoursPerPro: [],
      overtimeHours: 0,
      laborWarnings: [],
      subtotal: 1000,
      totalWithSurcharges: 1200,
    };
    // base = 1000 + 200 = 1200; discount 10% = 120; after = 1080; iva=0 → 1080
    const result = calculateBudgetTotals([block], 10, 0);
    expect(result.ivaAmount).toBe(0);
    expect(result.totalFinal).toBe(1080);
    expect(result.discountAmount).toBe(120);
  });

  it('ivaPercent=21 with same data → ivaAmount=226.80, totalFinal=1306.80', () => {
    const block: import('@/lib/types').BlockCalculationResult = {
      workingDates: ['2026-07-13'],
      totalWorkingDays: 1,
      hoursPerPosition: 8,
      coverageHours: 8,
      totalHours: 8,
      shiftBreakdown: { total: 8, regular: 8, night: 0, sunday: 0, holiday: 0, holidayNational: 0, holidayAutonomico: 0, holidayProvincial: 0, holidayMunicipal: 0, weekend: 0 },
      surcharges: [],
      totalSurcharges: 200,
      puestosSimultaneos: 1,
      plantillaMinimaRecomendada: 1,
      plantillaSeleccionada: 1,
      deficitPlantilla: 0,
      weeklyHoursPerPro: [],
      overtimeHours: 0,
      laborWarnings: [],
      subtotal: 1000,
      totalWithSurcharges: 1200,
    };
    // base = 1200; discount 10% = 120; after = 1080; iva 21% = 226.80
    const result = calculateBudgetTotals([block], 10, 21);
    expect(result.ivaAmount).toBe(226.8);
    expect(result.totalFinal).toBe(1306.8);
  });

  it('D1 regression: ivaPercent=0 is not treated as missing (no fallback to 21)', () => {
    // Engine should respect 0 explicitly, not fall back to default 21
    const block: import('@/lib/types').BlockCalculationResult = {
      workingDates: ['2026-07-13'],
      totalWorkingDays: 1,
      hoursPerPosition: 8,
      coverageHours: 8,
      totalHours: 8,
      shiftBreakdown: { total: 8, regular: 8, night: 0, sunday: 0, holiday: 0, holidayNational: 0, holidayAutonomico: 0, holidayProvincial: 0, holidayMunicipal: 0, weekend: 0 },
      surcharges: [],
      totalSurcharges: 0,
      puestosSimultaneos: 1,
      plantillaMinimaRecomendada: 1,
      plantillaSeleccionada: 1,
      deficitPlantilla: 0,
      weeklyHoursPerPro: [],
      overtimeHours: 0,
      laborWarnings: [],
      subtotal: 5000,
      totalWithSurcharges: 5000,
    };
    // If 0 were treated as missing, total would be 6050 (5000*1.21).
    // With 0, total must be exactly 5000.
    const result = calculateBudgetTotals([block], 0, 0);
    expect(result.ivaAmount).toBe(0);
    expect(result.totalFinal).toBe(5000);
  });
});

// ════════════════════════════════════════════════════════════════
// E1 — 24h night hours must use real dual-window calc, not hardcoded formula
// ════════════════════════════════════════════════════════════════
describe('E1 — 24h shift night hours use real calc (dual-window)', () => {
  const holidays: HolidayInfo[] = [];

  it('24h with nightStart=22, nightEnd=6 → night=8h (real calc, not hardcoded)', () => {
    const result = calculateShiftHours(
      { shiftType: '24h', hoursPerDay: 24, breakMinutes: 0 },
      '2026-07-13', holidays, 22, 6,
    );
    expect(result.total).toBe(24);
    expect(result.night).toBe(8); // [22,24)=2 + [0,6)=6 = 8
    expect(result.regular).toBe(16);
  });

  it('24h with break: night hours adjusted proportionally', () => {
    // With 60min break, total=23h. Night fraction = 8/24 of total.
    // Decision: break is uniform across shift, so night = 23 * (8/24) = 7.6667
    const result = calculateShiftHours(
      { shiftType: '24h', hoursPerDay: 24, breakMinutes: 60 },
      '2026-07-13', holidays, 22, 6,
    );
    expect(result.total).toBe(23);
    // Night must be less than 8 (break reduces it) and more than 7.5
    expect(result.night).toBeLessThan(8);
    expect(result.night).toBeGreaterThan(7.5);
    expect(result.regular + result.night).toBeCloseTo(23, 10);
  });

  it('24h with nightStart=0, nightEnd=6 → night=6h (edge: nightStart=0)', () => {
    const result = calculateShiftHours(
      { shiftType: '24h', hoursPerDay: 24, breakMinutes: 0 },
      '2026-07-13', holidays, 0, 6,
    );
    expect(result.night).toBe(6);
    expect(result.regular).toBe(18);
  });

  it('24h with nightEnd > nightStart (inverted config) → still calculates correctly', () => {
    // If nightStart=6, nightEnd=22 → night = 24-6=18? That's unusual but engine must not return 0.
    // With inverted (nightEnd > nightStart), current code returns 0 — the fix must handle this.
    const result = calculateShiftHours(
      { shiftType: '24h', hoursPerDay: 24, breakMinutes: 0 },
      '2026-07-13', holidays, 6, 22,
    );
    // 24h covers the entire day. Night window [6,22) = 16h of day hours, so night=16
    expect(result.total).toBe(24);
    expect(result.night).toBe(16);
    expect(result.regular).toBe(8);
  });
});

// ════════════════════════════════════════════════════════════════
// E2 — No intermediate rounding: subtotal + surcharges must match hand calc
// ════════════════════════════════════════════════════════════════
describe('E2 — No intermediate rounding in subtotal+surcharges', () => {
  it('puestos=3, 7.5h/day, 20 days: subtotal and surcharges use same base hours', () => {
    // Hand calc: 7.5h × 20 days = 150h per position
    // Coverage: 150 × 3 = 450h
    // Subtotal: 450 × 10€ = 4.500,00€
    // If nocturnidad 25% on 30% night (nightStart=22,end=6, 8/24=33.33%):
    //   coverageNight = 450 × (8/24) = 150h
    //   surcharge = 10 × 150 × 0.25 = 375,00€
    // Total = 4.500 + 375 = 4.875,00€
    // The key: subtotal + surcharges must exactly equal what you get computing from unrounded hours.
    const result = calculateServiceBlock({
      block: {
        serviceName: 'Test',
        professionalCategory: 'Enfermería',
        puestosSimultaneos: 3,
        plantillaSeleccionada: 3,
        pricePerHour: 10,
        dateMode: 'range',
        dateRangeStart: '2026-07-13',
        dateRangeEnd: '2026-08-01',
        daysOfWeek: [1, 2, 3, 4, 5, 6],
        excludeSundays: true,
        excludeHolidays: false,
        shiftType: '24h',
        hoursPerDay: 7.5,
        breakMinutes: 0,
        unitType: 'hora',
        quantity: 1,
      },
      holidays: [],
      surcharges: [
        { type: 'nocturnidad', name: 'Nocturnidad', surchargeType: 'percentage', value: 25 },
      ],
      laborRules: { maxWeeklyHours: 40, maxDailyHours: 12, minRestBetweenShiftsH: 11, maxConsecutiveDays: 6, nightStartHour: 22, nightEndHour: 6 },
    });

    // Compute from raw hours (no intermediate rounding):
    const posTotal = result.shiftBreakdown.total; // per-position total hours (unrounded)
    const coverageTotal = posTotal * 3;
    const subtotalExpected = coverageTotal * 10;
    const nightHours = result.shiftBreakdown.night; // per-position night
    const coverageNight = nightHours * 3;
    const surchargeExpected = 10 * coverageNight * 0.25;

    // Subtotal must match the hand-calc from unrounded hours
    expect(result.subtotal).toBeCloseTo(Math.round(subtotalExpected * 100) / 100, 2);
    // Total surcharges must match
    expect(result.totalSurcharges).toBeCloseTo(Math.round(surchargeExpected * 100) / 100, 2);
    // And they must sum correctly
    expect(result.totalWithSurcharges).toBeCloseTo(
      Math.round((subtotalExpected + surchargeExpected) * 100) / 100, 2
    );
  });
});

// ════════════════════════════════════════════════════════════════
// E3 — IVA clamped to [0, 100]
// ════════════════════════════════════════════════════════════════
describe('E3 — IVA clamped to max 100%', () => {
  const block = {
    workingDates: ['2026-07-13'], totalWorkingDays: 1, hoursPerPosition: 8,
    coverageHours: 8, totalHours: 8,
    shiftBreakdown: { total: 8, regular: 8, night: 0, sunday: 0, holiday: 0, holidayNational: 0, holidayAutonomico: 0, holidayProvincial: 0, holidayMunicipal: 0, weekend: 0 } as ShiftHourBreakdown,
    surcharges: [], totalSurcharges: 0, puestosSimultaneos: 1,
    plantillaMinimaRecomendada: 1, plantillaSeleccionada: 1, deficitPlantilla: 0,
    weeklyHoursPerPro: [], overtimeHours: 0, laborWarnings: [],
    subtotal: 1000, totalWithSurcharges: 1000,
  };

  it('ivaPercent=2100 is clamped to 100 → ivaAmount=1000, total=2000', () => {
    const r = calculateBudgetTotals([block], 0, 2100);
    // base=1000, iva clamped to 100% → 1000
    expect(r.ivaAmount).toBe(1000);
    expect(r.totalFinal).toBe(2000);
  });

  it('ivaPercent=-50 is clamped to 0 → ivaAmount=0', () => {
    const r = calculateBudgetTotals([block], 0, -50);
    expect(r.ivaAmount).toBe(0);
    expect(r.totalFinal).toBe(1000);
  });

  it('ivaPercent=100 → total = 2× base', () => {
    const r = calculateBudgetTotals([block], 0, 100);
    expect(r.ivaAmount).toBe(1000);
    expect(r.totalFinal).toBe(2000);
  });
});

// ════════════════════════════════════════════════════════════════
// E4 — parseHHMM replaces fragile parseInt
// ════════════════════════════════════════════════════════════════
describe('E4 — parseHHMM handles HH:MM correctly', () => {
  it('custom shift 22:30–06:15 detected as night in validateLaborRules', () => {
    // parseInt("22:30") = 22 (correct by accident), but parseInt("06:15") = 6 (also correct)
    // The real issue: "09:30" → parseInt = 9 (ok), but "00:45" → parseInt = 0 (correct, but fragile)
    // Test that a shift starting at 22:30 is detected as night
    const shift: import('@/lib/types').ShiftConfig = {
      shiftType: 'custom', hoursPerDay: 8, breakMinutes: 0,
      shiftStartTime: '22:30', shiftEndTime: '06:30',
    };
    const dates = ['2026-07-13'];
    const warnings = validateLaborRules(dates, 8, shift, 1, 1, 40, 12, 6, 11);
    expect(warnings.find(w => w.type === 'night_shift')).toBeDefined();
  });

  it('custom shift 21:45–05:00 → night_shift warning (21.75 >= 22 is false, but start >= 22 check uses HH only)', () => {
    // 21:45 → parseHHMM = 21.75 → < 22, so NOT detected as night by the >= 22 check.
    // This is actually correct behavior: the shift STARTS before night. Only the portion after 22 is night.
    // The warning is about shifts that START in the night window.
    const shift: import('@/lib/types').ShiftConfig = {
      shiftType: 'custom', hoursPerDay: 8, breakMinutes: 0,
      shiftStartTime: '21:45', shiftEndTime: '05:45',
    };
    const dates = ['2026-07-13'];
    const warnings = validateLaborRules(dates, 8, shift, 1, 1, 40, 12, 6, 11);
    // 21.75 < 22 → no night_shift warning (shift doesn't start in night)
    expect(warnings.find(w => w.type === 'night_shift')).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════
// E5 — Simple block routing: each blockType maps correctly
// ════════════════════════════════════════════════════════════════
describe('E5 — Block type routing is explicit and correct', () => {
  const simpleBlock = (overrides: Record<string, unknown> = {}) => calculateServiceBlock({
    block: {
      serviceName: 'Test',
      professionalCategory: 'Test',
      puestosSimultaneos: 1,
      pricePerHour: 10,
      dateMode: 'range',
      dateRangeStart: '2026-07-13',
      dateRangeEnd: '2026-07-14',
      excludeSundays: false,
      excludeHolidays: false,
      shiftType: 'morning',
      hoursPerDay: 8,
      breakMinutes: 0,
      unitType: 'hora',
      quantity: 1,
      ...overrides,
    },
    holidays: [],
    surcharges: [],
    laborRules: { maxWeeklyHours: 40, maxDailyHours: 12, minRestBetweenShiftsH: 11, maxConsecutiveDays: 6, nightStartHour: 22, nightEndHour: 6 },
  });

  it('blockType=material (simple) → subtotal=price*qty, no dates', () => {
    const r = simpleBlock({ blockType: 'material', unitType: 'unidad', quantity: 5, fixedPrice: 20 });
    expect(r.subtotal).toBe(100);
    expect(r.workingDates).toEqual([]);
    expect(r.totalWorkingDays).toBe(0);
  });

  it('blockType=alojamiento (simple) → nights*persons*price', () => {
    const r = simpleBlock({ blockType: 'alojamiento', unitType: 'servicio', quantity: 1, fixedPrice: 50, accommodationNights: 3, accommodationPersons: 2 });
    expect(r.subtotal).toBe(300); // 3 nights × 2 persons × 50
    expect(r.workingDates).toEqual([]);
  });

  it('blockType=profesional_hora, unitType=hora → temporal calc with dates', () => {
    const r = simpleBlock({ blockType: 'profesional_hora', unitType: 'hora' });
    expect(r.workingDates.length).toBeGreaterThan(0);
    expect(r.totalWorkingDays).toBeGreaterThan(0);
  });

  it('unitType=turno → temporal calc even without explicit blockType', () => {
    const r = simpleBlock({ unitType: 'turno' });
    expect(r.workingDates.length).toBeGreaterThan(0);
  });

  it('unitType=dia, blockType=profesional_hora → temporal calc (NOT simple)', () => {
    const r = simpleBlock({ unitType: 'dia', blockType: 'profesional_hora', hoursPerDay: 24, shiftType: '24h' });
    // 'dia' with profesional_hora should go to temporal path
    expect(r.workingDates.length).toBeGreaterThan(0);
    expect(r.totalWorkingDays).toBeGreaterThan(0);
  });

  it('unitType=dia, blockType=undefined → temporal calc (dia defaults to temporal)', () => {
    const r = simpleBlock({ unitType: 'dia', blockType: undefined, hoursPerDay: 24, shiftType: '24h' });
    // 'dia' without a simple blockType goes to temporal path
    expect(r.workingDates.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════
// E6 — Input guards: invalid inputs produce 0 + warning, never NaN
// ════════════════════════════════════════════════════════════════
describe('E6 — Input guards: graceful handling of invalid inputs', () => {
  it('hoursPerDay=0 → result is 0, no NaN, no negative', () => {
    const r = calculateServiceBlock({
      block: {
        serviceName: 'Test', professionalCategory: 'Test', puestosSimultaneos: 1,
        pricePerHour: 10, dateMode: 'range',
        dateRangeStart: '2026-07-13', dateRangeEnd: '2026-07-15',
        excludeSundays: false, excludeHolidays: false,
        shiftType: 'morning', hoursPerDay: 0, breakMinutes: 0,
        unitType: 'hora', quantity: 1,
      },
      holidays: [], surcharges: [],
      laborRules: { maxWeeklyHours: 40, maxDailyHours: 12, minRestBetweenShiftsH: 11, maxConsecutiveDays: 6, nightStartHour: 22, nightEndHour: 6 },
    });
    expect(r.subtotal).toBe(0);
    expect(r.totalWithSurcharges).toBe(0);
    expect(isNaN(r.subtotal)).toBe(false);
    expect(r.subtotal).toBeGreaterThanOrEqual(0);
  });

  it('Inverted date range (end < start) → 0 dates, no crash', () => {
    const r = calculateServiceBlock({
      block: {
        serviceName: 'Test', professionalCategory: 'Test', puestosSimultaneos: 1,
        pricePerHour: 10, dateMode: 'range',
        dateRangeStart: '2026-07-20', dateRangeEnd: '2026-07-13',
        excludeSundays: false, excludeHolidays: false,
        shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
        unitType: 'hora', quantity: 1,
      },
      holidays: [], surcharges: [],
      laborRules: { maxWeeklyHours: 40, maxDailyHours: 12, minRestBetweenShiftsH: 11, maxConsecutiveDays: 6, nightStartHour: 22, nightEndHour: 6 },
    });
    expect(r.workingDates).toEqual([]);
    expect(r.subtotal).toBe(0);
    expect(isNaN(r.subtotal)).toBe(false);
  });

  it('Negative pricePerHour → subtotal clamped to 0', () => {
    const r = calculateServiceBlock({
      block: {
        serviceName: 'Test', professionalCategory: 'Test', puestosSimultaneos: 1,
        pricePerHour: -10, dateMode: 'range',
        dateRangeStart: '2026-07-13', dateRangeEnd: '2026-07-14',
        excludeSundays: false, excludeHolidays: false,
        shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
        unitType: 'hora', quantity: 1,
      },
      holidays: [], surcharges: [],
      laborRules: { maxWeeklyHours: 40, maxDailyHours: 12, minRestBetweenShiftsH: 11, maxConsecutiveDays: 6, nightStartHour: 22, nightEndHour: 6 },
    });
    expect(r.subtotal).toBe(0);
    expect(r.subtotal).toBeGreaterThanOrEqual(0);
  });

  it('breakMinutes >= total shift hours → hours clamped to 0, no negative', () => {
    const r = calculateServiceBlock({
      block: {
        serviceName: 'Test', professionalCategory: 'Test', puestosSimultaneos: 1,
        pricePerHour: 10, dateMode: 'range',
        dateRangeStart: '2026-07-13', dateRangeEnd: '2026-07-14',
        excludeSundays: false, excludeHolidays: false,
        shiftType: 'morning', hoursPerDay: 4, breakMinutes: 300, // 5h break > 4h shift
        unitType: 'hora', quantity: 1,
      },
      holidays: [], surcharges: [],
      laborRules: { maxWeeklyHours: 40, maxDailyHours: 12, minRestBetweenShiftsH: 11, maxConsecutiveDays: 6, nightStartHour: 22, nightEndHour: 6 },
    });
    expect(r.subtotal).toBe(0);
    expect(r.subtotal).toBeGreaterThanOrEqual(0);
    expect(isNaN(r.subtotal)).toBe(false);
  });
});
// ════════════════════════════════════════════════════════════════
// A2 (REGRESIÓN multi-día) — un festivo entre semana NO debe anular
// el recargo de un domingo normal de otra fecha (bug de infrafacturación).
// ════════════════════════════════════════════════════════════════
describe('A2 multi-día — domingo normal + festivo en otro día', () => {
  const LR = { maxWeeklyHours: 40, maxDailyHours: 12, minRestBetweenShiftsH: 12, maxConsecutiveDays: 6, nightStartHour: 22, nightEndHour: 6 };
  const baseBlock = {
    serviceName: 's', professionalCategory: 'enf', puestosSimultaneos: 1, plantillaSeleccionada: 1,
    pricePerHour: 30, shiftType: 'morning' as const, hoursPerDay: 8, breakMinutes: 0,
    unitType: 'hora' as const, quantity: 1, enabledSurcharges: ['domingo', 'festivo_nacional'] as SurchargeType[],
  };
  const surcharges = [
    { type: 'domingo' as SurchargeType, name: 'Dominical', surchargeType: 'percentage' as SurchargeKind, value: 25 },
    { type: 'festivo_nacional' as SurchargeType, name: 'Festivo Nacional', surchargeType: 'percentage' as SurchargeKind, value: 75 },
  ];

  it('2 fechas: 1 domingo normal + 1 festivo nacional entre semana → 60 + 180 = 240', () => {
    const r = calculateServiceBlock({
      block: { ...baseBlock, dateMode: 'specific' as const, specificDates: ['2026-11-08', '2026-12-08'] },
      holidays: [{ date: '2026-12-08', name: 'Inmaculada', type: 'nacional' }],
      surcharges, laborRules: LR,
    });
    expect(r.totalSurcharges).toBe(240); // antes del fix daba 180 (el domingo se perdía)
    expect(r.surcharges.find(e => e.type === 'domingo')?.amount).toBe(60);
    expect(r.surcharges.find(e => e.type === 'festivo_nacional')?.amount).toBe(180);
  });

  it('mes completo con 4 domingos + 1 festivo entre semana → los 4 domingos se facturan', () => {
    const r = calculateServiceBlock({
      block: { ...baseBlock, dateMode: 'range' as const, dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-31', daysOfWeek: [0,1,2,3,4,5,6] },
      holidays: [{ date: '2026-07-14', name: 'X', type: 'nacional' }],
      surcharges, laborRules: LR,
    });
    // Julio 2026: domingos 5,12,19,26 = 4 × 8h × 30 × 0.25 = 240
    expect(r.surcharges.find(e => e.type === 'domingo')?.amount).toBe(240);
  });
});
