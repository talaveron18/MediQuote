export interface BlockPriceAllocation {
  initialPriceExVat: number;
  discountAmount: number;
  closingPriceExVat: number;
  ivaPercent: number;
  ivaAmount: number;
  totalWithVat: number;
}

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Reparte un total monetario entre bloques sin perder céntimos. El último
 * bloque con peso absorbe el ajuste de redondeo, por lo que la suma siempre
 * coincide exactamente con el total comercial calculado por el servidor.
 */
export function allocateMoney(total: number, weights: number[]): number[] {
  const safeTotal = roundMoney(Math.max(0, Number(total) || 0));
  const safeWeights = weights.map((weight) => Math.max(0, Number(weight) || 0));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (safeWeights.length === 0) return [];
  if (weightTotal <= 0) return safeWeights.map(() => 0);

  const lastPositiveIndex = safeWeights.reduce(
    (last, weight, index) => (weight > 0 ? index : last),
    -1,
  );
  let allocated = 0;
  return safeWeights.map((weight, index) => {
    if (weight <= 0) return 0;
    if (index === lastPositiveIndex) return roundMoney(safeTotal - allocated);
    const value = roundMoney(safeTotal * weight / weightTotal);
    allocated = roundMoney(allocated + value);
    return value;
  });
}

export function allocateBlockPricing(input: {
  internalCosts: number[];
  initialPriceExVat: number;
  closingPriceExVat: number;
  ivaPercents: number[];
}): BlockPriceAllocation[] {
  const initial = allocateMoney(input.initialPriceExVat, input.internalCosts);
  const closing = allocateMoney(input.closingPriceExVat, input.internalCosts);

  return input.internalCosts.map((_, index) => {
    const initialPriceExVat = initial[index] ?? 0;
    const closingPriceExVat = closing[index] ?? 0;
    const ivaPercent = Math.min(100, Math.max(0, Number(input.ivaPercents[index] ?? 21)));
    const ivaAmount = roundMoney(closingPriceExVat * ivaPercent / 100);
    return {
      initialPriceExVat,
      discountAmount: roundMoney(initialPriceExVat - closingPriceExVat),
      closingPriceExVat,
      ivaPercent,
      ivaAmount,
      totalWithVat: roundMoney(closingPriceExVat + ivaAmount),
    };
  });
}

