import { describe, expect, it } from 'vitest';
import { assertFiniteNumbers, findNonFiniteNumbers } from './numeric-safety';

describe('numeric safety barrier', () => {
  it('finds NaN and Infinity recursively with their exact paths', () => {
    expect(findNonFiniteNumbers({ total: Infinity, blocks: [{ iva: 2 }, { iva: Number.NaN }] }))
      .toEqual(['result.total', 'result.blocks[1].iva']);
  });

  it('accepts an entirely finite economic result', () => {
    expect(() => assertFiniteNumbers({ total: 12.34, blocks: [0, 4.2] })).not.toThrow();
  });
});
