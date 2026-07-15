import type {
  BlockCalculationResult,
  HolidayInfo,
  SurchargeConfigDTO,
} from '@/lib/types';

type TestLaborRules = {
  maxWeeklyHours: number;
  maxDailyHours: number;
  minRestBetweenShiftsH: number;
  maxConsecutiveDays: number;
  nightStartHour: number;
  nightEndHour: number;
};

declare module '@/lib/schedule-engine' {
  export function calculateServiceBlock(params: {
    block: Record<string, unknown>;
    holidays: HolidayInfo[];
    surcharges: SurchargeConfigDTO[];
    laborRules: TestLaborRules;
  }): BlockCalculationResult;
}
