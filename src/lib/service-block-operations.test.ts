import { beforeEach, describe, expect, it } from 'vitest';
import { cloneServiceBlock, cloneServiceBlockAt, moveServiceBlock } from '@/lib/service-block-operations';
import { emptyBlock, useAppStore } from '@/store/app-store';
import type { BlockCalculationResult, BudgetCalculationResult, ServiceBlockInput } from '@/lib/types';

function block(name: string, id?: string): ServiceBlockInput {
  return {
    ...emptyBlock,
    id,
    serviceName: name,
    specificDates: ['2026-09-14'],
    daysOfWeek: [1, 3, 5],
    holidayTypesExcluded: ['nacional', 'autonomico'],
    enabledSurcharges: ['nocturnidad'],
  };
}

const fakeResult = {
  workingDates: [], totalWorkingDays: 0, hoursPerPosition: 0, coverageHours: 0, totalHours: 0,
  shiftBreakdown: { total: 0, regular: 0, night: 0, sunday: 0, holiday: 0, holidayNational: 0, holidayAutonomico: 0, holidayProvincial: 0, holidayMunicipal: 0, weekend: 0 },
  surcharges: [], totalSurcharges: 0, puestosSimultaneos: 1, plantillaMinimaRecomendada: 1,
  plantillaSeleccionada: 1, deficitPlantilla: 0, weeklyHoursPerPro: [], overtimeHours: 0,
  laborWarnings: [], subtotal: 0, totalWithSurcharges: 0,
} satisfies BlockCalculationResult;

const fakeTotals = {
  blocks: [fakeResult], subtotal: 0, totalSurcharges: 0, discountAmount: 0, ivaAmount: 0, totalFinal: 0,
} satisfies BudgetCalculationResult;

describe('service block operations', () => {
  it('clones an editable block without reusing persisted identity or mutable arrays', () => {
    const source = block('Original', 'persisted-block-id');
    const cloned = cloneServiceBlock(source);

    expect(cloned).not.toBe(source);
    expect(cloned.id).toBeUndefined();
    expect(cloned.serviceName).toBe('Original');
    expect(cloned.specificDates).toEqual(source.specificDates);
    expect(cloned.daysOfWeek).toEqual(source.daysOfWeek);
    expect(cloned.holidayTypesExcluded).toEqual(source.holidayTypesExcluded);
    expect(cloned.enabledSurcharges).toEqual(source.enabledSurcharges);

    expect(cloned.specificDates).not.toBe(source.specificDates);
    expect(cloned.daysOfWeek).not.toBe(source.daysOfWeek);
    expect(cloned.holidayTypesExcluded).not.toBe(source.holidayTypesExcluded);
    expect(cloned.enabledSurcharges).not.toBe(source.enabledSurcharges);

    cloned.specificDates?.push('2026-09-15');
    cloned.daysOfWeek?.push(0);
    expect(source.specificDates).toEqual(['2026-09-14']);
    expect(source.daysOfWeek).toEqual([1, 3, 5]);
  });

  it('inserts a clone directly after its source and leaves invalid indexes untouched', () => {
    const original = [block('A', 'a'), block('B', 'b')];
    const next = cloneServiceBlockAt(original, 0);

    expect(next.map((item) => item.serviceName)).toEqual(['A', 'A', 'B']);
    expect(next[1].id).toBeUndefined();
    expect(next[0].id).toBe('a');
    expect(cloneServiceBlockAt(original, -1)).toBe(original);
    expect(cloneServiceBlockAt(original, 99)).toBe(original);
  });

  it('moves blocks one position without losing data and treats boundaries as no-ops', () => {
    const original = [block('A', 'a'), block('B', 'b'), block('C', 'c')];

    expect(moveServiceBlock(original, 1, -1).map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(moveServiceBlock(original, 1, 1).map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(moveServiceBlock(original, 0, -1)).toBe(original);
    expect(moveServiceBlock(original, 2, 1)).toBe(original);
    expect(original.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('budget store structural operations', () => {
  beforeEach(() => {
    useAppStore.setState({
      serviceBlocks: [block('A', 'a'), block('B', 'b')],
      blockResults: [fakeResult],
      budgetTotals: fakeTotals,
    });
  });

  it('invalidates all derived server results when cloning', () => {
    useAppStore.getState().cloneServiceBlock(0);
    const state = useAppStore.getState();

    expect(state.serviceBlocks.map((item) => item.serviceName)).toEqual(['A', 'A', 'B']);
    expect(state.serviceBlocks[1].id).toBeUndefined();
    expect(state.blockResults).toEqual([]);
    expect(state.budgetTotals).toBeNull();
  });

  it('invalidates all derived server results when reordering', () => {
    useAppStore.getState().moveServiceBlock(1, -1);
    const state = useAppStore.getState();

    expect(state.serviceBlocks.map((item) => item.id)).toEqual(['b', 'a']);
    expect(state.blockResults).toEqual([]);
    expect(state.budgetTotals).toBeNull();
  });

  it('does not erase valid derived state for an impossible boundary move', () => {
    useAppStore.getState().moveServiceBlock(0, -1);
    const state = useAppStore.getState();

    expect(state.serviceBlocks.map((item) => item.id)).toEqual(['a', 'b']);
    expect(state.blockResults).toEqual([fakeResult]);
    expect(state.budgetTotals).toEqual(fakeTotals);
  });
});
