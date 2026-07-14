import type { BlockCalculationResult, ShiftHourBreakdown } from '../types';
import type { CostHoursInput } from './cost-types';

/**
 * Adapta el resultado operativo de MediQuote al motor de costes.
 * El calendario se calcula una sola vez. El desglose del bloque es por puesto,
 * por lo que aquí se multiplica por los puestos simultáneos para obtener horas
 * reales de cobertura facturable.
 */
export function adaptBlockResultToCostHours(
  block: BlockCalculationResult,
): CostHoursInput {
  const positions = Math.max(0, block.puestosSimultaneos);
  const breakdown = {} as ShiftHourBreakdown;

  for (const key of Object.keys(block.shiftBreakdown) as (keyof ShiftHourBreakdown)[]) {
    breakdown[key] = block.shiftBreakdown[key] * positions;
  }

  return {
    coverageHours: block.coverageHours,
    workingDays: block.totalWorkingDays * positions,
    shifts: block.totalWorkingDays * positions,
    breakdown,
  };
}
