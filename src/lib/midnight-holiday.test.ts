import { describe, expect, it } from 'vitest';
import { calculateServiceBlock, calculateShiftHours } from './calculation-engine';
import type { HolidayInfo, SurchargeConfigDTO } from './types';

const holidays: HolidayInfo[] = [
  { date: '2027-01-01', name: 'Año Nuevo', type: 'nacional', recurring: true },
];

const surcharges: SurchargeConfigDTO[] = [
  { name: 'Nocturnidad', type: 'nocturnidad', surchargeType: 'percentage', value: 25 },
  { name: 'Festivo Nacional', type: 'festivo_nacional', surchargeType: 'percentage', value: 75 },
];

const laborRules = {
  maxWeeklyHours: 40,
  maxDailyHours: 12,
  minRestBetweenShiftsH: 12,
  maxConsecutiveDays: 6,
  nightStartHour: 22,
  nightEndHour: 6,
};

describe('overnight shifts that cross into a holiday', () => {
  it('splits special-day hours by the real calendar date', () => {
    const breakdown = calculateShiftHours(
      {
        shiftType: 'custom',
        shiftStartTime: '22:00',
        shiftEndTime: '06:00',
        hoursPerDay: 8,
        breakMinutes: 0,
      },
      '2026-12-31',
      holidays,
    );

    expect(breakdown.total).toBe(8);
    expect(breakdown.night).toBe(8);
    expect(breakdown.holiday).toBe(6);
    expect(breakdown.holidayNational).toBe(6);
    expect(breakdown.sunday).toBe(0);
    expect(breakdown.weekend).toBe(0);
  });

  it('charges holiday and night surcharges for their own overlapping concepts', () => {
    const result = calculateServiceBlock({
      block: {
        serviceName: 'Guardia nocturna fin de año',
        professionalCategory: 'Enfermero',
        puestosSimultaneos: 1,
        plantillaSeleccionada: 1,
        pricePerHour: 30,
        dateMode: 'specific',
        specificDates: ['2026-12-31'],
        excludeSundays: false,
        excludeHolidays: false,
        shiftType: 'custom',
        shiftStartTime: '22:00',
        shiftEndTime: '06:00',
        hoursPerDay: 8,
        breakMinutes: 0,
        unitType: 'hora',
        quantity: 1,
      },
      holidays,
      surcharges,
      laborRules,
    });

    expect(result.subtotal).toBe(240);
    expect(result.shiftBreakdown.holidayNational).toBe(6);
    expect(result.surcharges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'nocturnidad', hours: 8, amount: 60 }),
        expect.objectContaining({ type: 'festivo_nacional', hours: 6, amount: 135 }),
      ]),
    );
    expect(result.totalSurcharges).toBe(195);
    expect(result.totalWithSurcharges).toBe(435);
  });
});
