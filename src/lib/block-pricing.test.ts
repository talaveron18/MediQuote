import { describe, expect, it } from 'vitest';
import { allocateBlockPricing, allocateMoney } from './block-pricing';

describe('block pricing allocation', () => {
  it('preserves the exact total when two blocks are added', () => {
    const parts = allocateMoney(1234.57, [100, 200]);
    expect(parts).toHaveLength(2);
    expect(parts.reduce((sum, value) => sum + value, 0)).toBe(1234.57);
    expect(parts[0]).toBeGreaterThan(0);
    expect(parts[1]).toBeGreaterThan(parts[0]);
  });

  it('calculates IVA independently for every block', () => {
    const blocks = allocateBlockPricing({
      internalCosts: [100, 100],
      initialPriceExVat: 320,
      closingPriceExVat: 304,
      ivaPercents: [21, 0],
    });
    expect(blocks[0]).toMatchObject({ closingPriceExVat: 152, ivaPercent: 21, ivaAmount: 31.92 });
    expect(blocks[1]).toMatchObject({ closingPriceExVat: 152, ivaPercent: 0, ivaAmount: 0 });
    expect(blocks.reduce((sum, block) => sum + block.closingPriceExVat, 0)).toBe(304);
    expect(blocks.reduce((sum, block) => sum + block.totalWithVat, 0)).toBeCloseTo(335.92, 2);
  });

  it('adds every amount across several tabs without losing cents', () => {
    const blocks = allocateBlockPricing({
      internalCosts: [187.31, 602.77, 94.19, 315.73],
      initialPriceExVat: 1920,
      closingPriceExVat: 1848,
      ivaPercents: [21, 10, 0, 21],
    });
    expect(blocks).toHaveLength(4);
    expect(blocks.every(block => block.closingPriceExVat > 0)).toBe(true);
    expect(blocks.reduce((sum, block) => sum + block.closingPriceExVat, 0)).toBe(1848);
    expect(blocks.reduce((sum, block) => sum + block.initialPriceExVat, 0)).toBe(1920);
    const expectedVat = blocks.reduce((sum, block) => sum + Math.round(block.closingPriceExVat * block.ivaPercent) / 100, 0);
    expect(blocks.reduce((sum, block) => sum + block.ivaAmount, 0)).toBeCloseTo(expectedVat, 2);
    expect(blocks.reduce((sum, block) => sum + block.totalWithVat, 0)).toBeCloseTo(1848 + expectedVat, 2);
  });

  it.each([
    { total: Number.NaN, weights: [1] },
    { total: Infinity, weights: [1] },
    { total: 100, weights: [Number.NaN] },
    { total: 100, weights: [-1] },
  ])('blocks invalid money instead of silently turning it into zero: $total / $weights', input => {
    expect(() => allocateMoney(input.total, input.weights)).toThrow(RangeError);
  });

  it('blocks an invalid IVA instead of contaminating totals', () => {
    expect(() => allocateBlockPricing({ internalCosts: [100], initialPriceExVat: 160, closingPriceExVat: 152, ivaPercents: [Number.NaN] }))
      .toThrow(RangeError);
  });
});
