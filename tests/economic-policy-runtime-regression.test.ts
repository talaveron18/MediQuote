import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateClosingPriceFromDiscount,
  calculateCommercialResult,
  calculateMaximumClientDiscountPercent,
  calculatePriceRange,
} from '../src/lib/costing/commercial-policy';
import { calculateCosting } from '../src/lib/costing/cost-engine';
import type { CommercialPolicy, CostingInput } from '../src/lib/costing/cost-types';

const policy: CommercialPolicy = {
  gasiMarkupOnCostPercent: 20,
  commercialFloorOnCostPercent: 10,
  commercialBufferOnCostPercent: 15,
  commissionAtFloorPercent: 5,
  commissionIntermediatePercent: 7,
  commissionAtListPercent: 10,
  semaphoreReviewReturnOnCostPercent: 15,
  semaphoreTargetReturnOnCostPercent: 25,
};

test('precio inicial y mínimo se calculan desde coste + política y conservan la banda', () => {
  const range = calculatePriceRange(100, policy);
  assert.deepEqual(range, { minimumOrdinaryPriceExVat: 130, initialListPriceExVat: 145 });
  assert.ok(range.initialListPriceExVat > range.minimumOrdinaryPriceExVat);
});

test('descuento solicitado queda limitado a la banda y nunca perfora el mínimo', () => {
  const max = calculateMaximumClientDiscountPercent(policy);
  assert.equal(calculateClosingPriceFromDiscount({ totalInternalCost: 100, requestedDiscountPercent: -50, policy }), 145);
  assert.equal(calculateClosingPriceFromDiscount({ totalInternalCost: 100, requestedDiscountPercent: max + 50, policy }), 130);
  const middle = calculateClosingPriceFromDiscount({ totalInternalCost: 100, requestedDiscountPercent: max / 2, policy });
  assert.ok(middle > 130 && middle < 145);
});

test('comisión y semáforo usan el beneficio final real después de comisión', () => {
  const result = calculateCommercialResult({ totalInternalCost: 100, closingPriceExVat: 145, policy });
  assert.equal(result.netBeforeCommission, 45);
  assert.equal(result.commissionRatePercent, 10);
  assert.equal(result.commissionAmount, 4.5);
  assert.equal(result.finalGasiBenefit, 40.5);
  assert.equal(result.gasiReturnOnCostPercent, 40.5);
  assert.equal(result.semaphore, 'green');
});

test('configuración económica incompleta no produce importes ni falso cálculo', () => {
  const incomplete = {
    professionalProfile: 'perfil-prueba',
    province: 'Madrid',
    hours: { coverageHours: 1, workingDays: 1, shifts: 1, breakdown: { total: 1, regular: 1, night: 0, sunday: 0, holiday: 0, holidayNational: 0, holidayAutonomico: 0, holidayProvincial: 0, holidayMunicipal: 0, weekend: 0 } },
    plusRules: [],
    directCosts: [],
  } as unknown as CostingInput;
  const result = calculateCosting(incomplete);
  assert.equal(result.status, 'pending_configuration');
  assert.ok(result.issues.length > 0);
  assert.ok(!('internalCost' in result));
});
