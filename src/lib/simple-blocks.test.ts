import { describe, expect, it } from 'vitest';
import { calculateServiceBlock } from '@/lib/schedule-engine';

const laborRules = {
  maxWeeklyHours: 40,
  maxDailyHours: 12,
  minRestBetweenShiftsH: 11,
  maxConsecutiveDays: 6,
  nightStartHour: 22,
  nightEndHour: 6,
};

describe('P0-CALC — simple blocks preserve explicit zero values', () => {
  it('quantity=0 is respected and does not fall back to 1', () => {
    const result = calculateServiceBlock({
      block: {
        blockType: 'material',
        serviceName: 'Material demo',
        professionalCategory: 'Material',
        puestosSimultaneos: 1,
        pricePerHour: 0,
        dateMode: 'specific',
        excludeSundays: false,
        excludeHolidays: false,
        shiftType: 'morning',
        hoursPerDay: 0,
        breakMinutes: 0,
        unitType: 'unidad',
        quantity: 0,
        fixedPrice: 20,
      },
      holidays: [],
      surcharges: [],
      laborRules,
    });

    expect(result.subtotal).toBe(0);
    expect(result.hoursPerPosition).toBe(0);
  });

  it('fixedPrice=0 is respected and does not fall back to pricePerHour', () => {
    const result = calculateServiceBlock({
      block: {
        blockType: 'material',
        serviceName: 'Material demo',
        professionalCategory: 'Material',
        puestosSimultaneos: 1,
        pricePerHour: 10,
        dateMode: 'specific',
        excludeSundays: false,
        excludeHolidays: false,
        shiftType: 'morning',
        hoursPerDay: 0,
        breakMinutes: 0,
        unitType: 'unidad',
        quantity: 5,
        fixedPrice: 0,
      },
      holidays: [],
      surcharges: [],
      laborRules,
    });

    expect(result.subtotal).toBe(0);
    expect(result.hoursPerPosition).toBe(5);
  });

  it('accommodationNights=0 is respected and does not fall back to quantity or 1', () => {
    const result = calculateServiceBlock({
      block: {
        blockType: 'alojamiento',
        serviceName: 'Alojamiento demo',
        professionalCategory: 'Alojamiento',
        puestosSimultaneos: 1,
        pricePerHour: 50,
        dateMode: 'specific',
        excludeSundays: false,
        excludeHolidays: false,
        shiftType: 'morning',
        hoursPerDay: 0,
        breakMinutes: 0,
        unitType: 'servicio',
        quantity: 3,
        fixedPrice: 50,
        accommodationNights: 0,
        accommodationPersons: 2,
      },
      holidays: [],
      surcharges: [],
      laborRules,
    });

    expect(result.subtotal).toBe(0);
    expect(result.hoursPerPosition).toBe(0);
  });
});
