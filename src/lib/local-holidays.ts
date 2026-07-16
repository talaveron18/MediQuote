import localHolidayRows from '@/data/local-holidays-2026.json';
import type { HolidayInfo } from './types';

export interface LocalHolidayCalendar {
  ineCode: string;
  autonomousCommunity: string;
  province: string;
  municipality: string;
  dates: string[];
  status: 'verified' | 'partial' | 'not_communicated';
  sourceReference: string;
  sourceUrl: string;
}

const calendars = localHolidayRows as LocalHolidayCalendar[];
const byIneCode = new Map(calendars.map((row) => [row.ineCode, row]));

export function getLocalHolidayCalendar(ineCode: string): LocalHolidayCalendar | null {
  return byIneCode.get(ineCode) ?? null;
}

export function getMunicipalHolidays(ineCode: string, year: number): HolidayInfo[] {
  const calendar = getLocalHolidayCalendar(ineCode);
  if (!calendar || year !== 2026) return [];
  return calendar.dates.map((date, index) => ({
    date,
    name: `Festivo local ${index + 1} · ${calendar.municipality}`,
    type: 'municipal',
    autonomousCommunity: calendar.autonomousCommunity,
    province: calendar.province,
    municipality: calendar.municipality,
    recurring: false,
  }));
}

