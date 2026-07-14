import { describe, expect, it } from 'vitest';
import { calculateServiceBlock } from '@/lib/calculation-engine';

const laborRules = {
  maxWeeklyHours: 40,
  maxDailyHours: 12,
  minRestBetweenShiftsH: 11,
  maxConsecutiveDays: 6,
  nightStartHour: 22,
  nightEndHour: 6,
};

describe('P0-CALC — minimum staff uses real calculated shift hours', () => {
  it('custom 05:00-23:00 uses 18h/day for staffing even if hoursPerDay is 8', () => {
    const result = calculateServiceBlock({
      block: {
        serviceName: 'Cobertura custom larga',
        professionalCategory: 'Enfermería',
        puestosSimultaneos: 1,
        plantillaSeleccionada: 1,
        pricePerHour: 30,
        dateMode: 'specific',
        specificDates: ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'],
        excludeSundays: false,
        excludeHolidays: false,
        shiftType: 'custom',
        shiftStartTime: '05:00',
        shiftEndTime: '23:00',
        hoursPerDay: 8,
        breakMinutes: 0,
        unitType: 'hora',
        quantity: 1,
      },
      holidays: [],
      surcharges: [],
      laborRules,
    });

    expect(result.hoursPerPosition).toBe(90);
    expect(result.subtotal).toBe(2700);
    expect(result.plantillaMinimaRecomendada).toBe(3);
    expect(result.weeklyHoursPerPro[0].hours).toBe(90);
    expect(result.laborWarnings.find((w) => w.type === 'max_weekly_exceeded')).toBeDefined();
    expect(result.laborWarnings.find((w) => w.type === 'staff_deficit')).toBeDefined();
  });
});
