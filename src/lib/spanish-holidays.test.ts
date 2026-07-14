import { describe, expect, it } from 'vitest';
import { findHolidayForDate } from '@/lib/calculation-engine';
import { generateHolidaysForYear, getHolidaysForDBSeed } from '@/lib/spanish-holidays';
import type { HolidayInfo } from '@/lib/types';

describe('Spanish holidays seed recurrence and scope', () => {
  it('marks movable holidays as non-recurring to avoid cross-year false matches', () => {
    const holidays = getHolidaysForDBSeed();
    const juevesSanto2026 = holidays.find(
      (h) => h.date === '2026-04-02' && h.name === 'Jueves Santo',
    );

    expect(juevesSanto2026).toBeDefined();
    expect(juevesSanto2026?.recurring).toBe(false);
  });

  it('marks fixed national holidays as recurring', () => {
    const holidays = getHolidaysForDBSeed();
    const navidad2026 = holidays.find(
      (h) => h.date === '2026-12-25' && h.name === 'Navidad',
    );

    expect(navidad2026).toBeDefined();
    expect(navidad2026?.recurring).toBe(true);
  });

  it('does not match a movable holiday by MM-DD in a different year', () => {
    const holidays = getHolidaysForDBSeed() as HolidayInfo[];

    expect(findHolidayForDate('2026-04-02', holidays)?.name).toBe('Jueves Santo');
    expect(findHolidayForDate('2027-04-02', holidays)).toBeNull();
  });

  it('still matches fixed recurring holidays by MM-DD across years', () => {
    const holidays = getHolidaysForDBSeed() as HolidayInfo[];

    expect(findHolidayForDate('2029-12-25', holidays)?.name).toBe('Navidad');
  });

  it('does not include Catalonia regional holidays in the global GASI seed', () => {
    const holidays = getHolidaysForDBSeed();

    expect(holidays.find((h) => h.autonomousCommunity === 'Cataluña')).toBeUndefined();
    expect(holidays.find((h) => h.name.includes('Diada'))).toBeUndefined();
    expect(holidays.find((h) => h.name.includes('Sant Joan'))).toBeUndefined();
  });

  it('global holidays generation without location only returns national holidays', () => {
    const holidays = generateHolidaysForYear(2026);

    expect(holidays.every((h) => h.type === 'nacional')).toBe(true);
  });

  it('regional holidays require explicit location', () => {
    const madrid = generateHolidaysForYear(2026, { cc: 'Madrid' });
    const catalonia = generateHolidaysForYear(2026, { cc: 'Cataluña' });

    expect(madrid.find((h) => h.name === 'Día de la Comunidad de Madrid')).toBeDefined();
    expect(catalonia.find((h) => h.name === 'Diada Nacional de Catalunya')).toBeDefined();
  });
});
