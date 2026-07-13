import { describe, expect, it } from 'vitest';
import { findHolidayForDate } from '@/lib/calculation-engine';
import { getHolidaysForDBSeed } from '@/lib/spanish-holidays';
import type { HolidayInfo } from '@/lib/types';

describe('Spanish holidays seed recurrence', () => {
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
});
