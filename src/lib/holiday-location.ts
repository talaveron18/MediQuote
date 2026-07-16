import type { HolidayInfo } from './types';

export type HolidayLocation = {
  cc?: string;
  province?: string;
  municipality?: string;
};

function samePlace(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  return left.trim().localeCompare(right.trim(), 'es', { sensitivity: 'base' }) === 0;
}

/**
 * A holiday only applies where its territorial fields match the service.
 * This also protects calculations against a badly classified record: a
 * "national" record carrying Cataluña must never affect Madrid or Burgos.
 */
export function isHolidayApplicableToLocation(holiday: HolidayInfo, location: HolidayLocation): boolean {
  if (holiday.autonomousCommunity && !samePlace(holiday.autonomousCommunity, location.cc)) return false;
  if (holiday.province && !samePlace(holiday.province, location.province)) return false;
  if (holiday.municipality && !samePlace(holiday.municipality, location.municipality)) return false;

  if (holiday.type === 'autonomico') return Boolean(holiday.autonomousCommunity && location.cc);
  if (holiday.type === 'provincial') return Boolean(holiday.province && location.province);
  if (holiday.type === 'municipal') return Boolean(holiday.municipality && location.municipality);
  return true;
}

export function filterHolidaysForLocation(holidays: HolidayInfo[], location: HolidayLocation): HolidayInfo[] {
  return holidays.filter((holiday) => isHolidayApplicableToLocation(holiday, location));
}

