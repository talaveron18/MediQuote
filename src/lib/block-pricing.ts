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

function finiteNonNegative(value: unknown, field: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new RangeError(`${field} debe ser un número finito igual o mayor que cero`);
  return numeric;
}

/**
 * Reparte un total monetario entre bloques sin perder céntimos. El último
 * bloque con peso absorbe el ajuste de redondeo, por lo que la suma siempre
 * coincide exactamente con el total comercial calculado por el servidor.
 */
export function allocateMoney(total: number, weights: number[]): number[] {
  const safeTotal = roundMoney(finiteNonNegative(total, 'total'));
  const safeWeights = weights.map((weight, index) => finiteNonNegative(weight, `weights[${index}]`));
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
    const rawIva = finiteNonNegative(input.ivaPercents[index] ?? 21, `ivaPercents[${index}]`);
    if (rawIva > 100) throw new RangeError(`ivaPercents[${index}] no puede superar el 100%`);
    const ivaPercent = rawIva;
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
