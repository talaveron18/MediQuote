import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync('src/lib/costing/commercial-policy.ts', 'utf8');
const engine = readFileSync('src/lib/costing/cost-engine.ts', 'utf8');
const spec = readFileSync('docs/COST_ENGINE_SPEC_V1.md', 'utf8');

test('precio mínimo e inicial se derivan del coste y de política explícita, sin precio manual silencioso', () => {
  assert.match(policy, /totalInternalCost \* \(\s*1\s*\+ policy\.gasiMarkupOnCostPercent \/ 100\s*\+ policy\.commercialFloorOnCostPercent \/ 100/);
  assert.match(policy, /minimumOrdinaryPriceExVat\s*\+ totalInternalCost \* \(policy\.commercialBufferOnCostPercent \/ 100\)/);
  assert.match(spec, /No existen fallbacks económicos ni ceros silenciosos/);
});

test('descuento comercial queda acotado al buffer autorizado y no perfora el mínimo', () => {
  assert.match(policy, /Math\.max\(0, Math\.min\(maximumDiscountPercent, params\.requestedDiscountPercent\)\)/);
  assert.match(policy, /return range\.minimumOrdinaryPriceExVat/);
  assert.match(spec, /no puede cerrarse por debajo del precio mínimo ni por encima del precio inicial/);
});

test('comisión se liquida sobre neto precomisión y no sobre venta ni coste bruto', () => {
  assert.match(policy, /const netBeforeCommission = closingPriceExVat - totalInternalCost/);
  assert.match(policy, /const commissionAmount = netBeforeCommission \* \(selected\.rate \/ 100\)/);
  assert.match(policy, /const finalGasiBenefit = netBeforeCommission - commissionAmount/);
});

test('semáforo usa beneficio final después de comisión sobre coste interno', () => {
  assert.match(policy, /finalGasiBenefit \/ totalInternalCost \* 100/);
  assert.match(policy, /selectSemaphore\(gasiReturnOnCostPercent, policy\)/);
  assert.match(spec, /El semáforo utiliza el beneficio final de GASI después de comisión y lo compara con el coste total interno/);
});

test('datos económicos incompletos mantienen estado pendiente en lugar de inventar importes', () => {
  assert.match(engine, /pending_configuration/);
  assert.match(spec, /status: pending_configuration/);
  assert.match(spec, /issues: \[campo y motivo exactos\]/);
});
