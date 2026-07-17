import type { BudgetSnapshot, ScenarioResult } from './types';

const round = (value: number) => Math.round(value * 100) / 100;

export function calculateScenario(
  snapshot: BudgetSnapshot,
  type: ScenarioResult['type'],
  percent: number,
): ScenarioResult {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Porcentaje de escenario no válido');
  const originalCost = snapshot.baseCost + snapshot.pluses + snapshot.socialSecurity + snapshot.overhead;
  if (!Number.isFinite(originalCost) || originalCost < 0 || snapshot.priceExVat <= 0) throw new Error('La foto económica no es válida');
  const ratio = percent / 100;
  const adjustedCost = type === 'descuento' ? originalCost : originalCost * (1 + ratio);
  const adjustedPrice = type === 'descuento' ? snapshot.priceExVat * (1 - ratio) : snapshot.priceExVat;
  const originalMargin = snapshot.priceExVat - originalCost;
  const adjustedMargin = adjustedPrice - adjustedCost;
  const marginPercent = adjustedPrice > 0 ? (adjustedMargin / adjustedPrice) * 100 : -100;
  return {
    type, inputPercent: percent, originalCost: round(originalCost), adjustedCost: round(adjustedCost),
    originalMargin: round(originalMargin), adjustedMargin: round(adjustedMargin),
    marginDelta: round(adjustedMargin - originalMargin),
    status: marginPercent < 10 ? 'rojo' : marginPercent < 25 ? 'ambar' : 'verde',
    explanation: type === 'absentismo'
      ? `Un absentismo del ${percent}% eleva el coste estimado sin cambiar el precio de cierre.`
      : type === 'descuento'
        ? `Un descuento del ${percent}% reduce directamente el precio y el margen disponible.`
        : `Un incremento salarial del ${percent}% eleva la base de coste utilizada en este escenario.`,
  };
}
