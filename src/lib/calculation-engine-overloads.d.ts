import type {
  BlockCalculationResult,
  HolidayInfo,
  LaborRuleDTO,
  SurchargeConfigDTO,
} from '@/lib/types';

declare module '@/lib/calculation-engine' {
  export function calculateServiceBlock(params: {
    block: Record<string, unknown>;
    holidays: HolidayInfo[];
    surcharges: SurchargeConfigDTO[];
    laborRules: LaborRuleDTO;
  }): BlockCalculationResult;
}
