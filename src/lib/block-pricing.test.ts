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
});
