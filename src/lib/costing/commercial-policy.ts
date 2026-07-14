import type {
  CommercialPolicy,
  CommercialResult,
  CommissionTier,
  EconomicSemaphore,
} from './cost-types';

const EPSILON = 0.005;

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const roundRate = (value: number): number => Math.round((value + Number.EPSILON) * 10_000) / 10_000;

export const DEFAULT_GASI_COMMERCIAL_POLICY: Readonly<CommercialPolicy> = Object.freeze({
  gasiMarkupOnCostPercent: 40,
  commercialFloorOnCostPercent: 12,
  commercialBufferOnCostPercent: 8,
  commissionAtFloorPercent: 12,
  commissionIntermediatePercent: 13.5,
  commissionAtListPercent: 15,
  semaphoreTargetReturnOnCostPercent: 40,
  semaphoreReviewReturnOnCostPercent: 30,
});

export function calculatePriceRange(
  totalInternalCost: number,
  policy: CommercialPolicy,
): { minimumOrdinaryPriceExVat: number; initialListPriceExVat: number } {
  const minimumOrdinaryPriceExVat = totalInternalCost * (
    1
    + policy.gasiMarkupOnCostPercent / 100
    + policy.commercialFloorOnCostPercent / 100
  );
  const initialListPriceExVat = minimumOrdinaryPriceExVat
    + totalInternalCost * (policy.commercialBufferOnCostPercent / 100);

  return {
    minimumOrdinaryPriceExVat: roundMoney(minimumOrdinaryPriceExVat),
    initialListPriceExVat: roundMoney(initialListPriceExVat),
  };
}

function selectCommissionTier(
  closingPrice: number,
  minimumPrice: number,
  listPrice: number,
  policy: CommercialPolicy,
): { tier: CommissionTier; rate: number } {
  if (Math.abs(closingPrice - minimumPrice) <= EPSILON) {
    return { tier: 'floor', rate: policy.commissionAtFloorPercent };
  }
  if (Math.abs(closingPrice - listPrice) <= EPSILON) {
    return { tier: 'list', rate: policy.commissionAtListPercent };
  }
  return { tier: 'intermediate', rate: policy.commissionIntermediatePercent };
}

function selectSemaphore(returnOnCost: number, policy: CommercialPolicy): EconomicSemaphore {
  if (returnOnCost >= policy.semaphoreTargetReturnOnCostPercent) return 'green';
  if (returnOnCost >= policy.semaphoreReviewReturnOnCostPercent) return 'yellow';
  return 'red';
}

export function calculateCommercialResult(params: {
  totalInternalCost: number;
  closingPriceExVat: number;
  policy: CommercialPolicy;
}): CommercialResult {
  const { totalInternalCost, closingPriceExVat, policy } = params;
  const range = calculatePriceRange(totalInternalCost, policy);
  const selected = selectCommissionTier(
    closingPriceExVat,
    range.minimumOrdinaryPriceExVat,
    range.initialListPriceExVat,
    policy,
  );

  const netBeforeCommission = closingPriceExVat - totalInternalCost;
  const commissionAmount = netBeforeCommission * (selected.rate / 100);
  const finalGasiBenefit = netBeforeCommission - commissionAmount;
  const gasiReturnOnCostPercent = totalInternalCost > 0
    ? finalGasiBenefit / totalInternalCost * 100
    : 0;
  const finalMarginOnSalePercent = closingPriceExVat > 0
    ? finalGasiBenefit / closingPriceExVat * 100
    : 0;
  const discountAmount = range.initialListPriceExVat - closingPriceExVat;

  return {
    ...range,
    closingPriceExVat: roundMoney(closingPriceExVat),
    clientDiscountAmount: roundMoney(discountAmount),
    clientDiscountPercentOfList: roundRate(
      range.initialListPriceExVat > 0
        ? discountAmount / range.initialListPriceExVat * 100
        : 0,
    ),
    commercialBufferConsumedPercentOfCost: roundRate(
      totalInternalCost > 0 ? discountAmount / totalInternalCost * 100 : 0,
    ),
    netBeforeCommission: roundMoney(netBeforeCommission),
    commissionTier: selected.tier,
    commissionRatePercent: selected.rate,
    commissionAmount: roundMoney(commissionAmount),
    finalGasiBenefit: roundMoney(finalGasiBenefit),
    gasiReturnOnCostPercent: roundRate(gasiReturnOnCostPercent),
    finalMarginOnSalePercent: roundRate(finalMarginOnSalePercent),
    semaphore: selectSemaphore(gasiReturnOnCostPercent, policy),
    requiresAuthorization: false,
  };
}
