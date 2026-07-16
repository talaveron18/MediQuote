import { describe, expect, it } from 'vitest';
import { cloneServiceBlockForReinforcement } from './service-block-clone';
import type { ServiceBlockInput } from './types';

describe('reinforcement block clone', () => {
  it('copies all editable parameters without reusing the database id', () => {
    const source: ServiceBlockInput = {
      id: 'persisted-id', blockType: 'profesional_hora', serviceName: 'Enfermería',
      professionalCategory: 'nurse', puestosSimultaneos: 1, plantillaSeleccionada: 1,
      pricePerHour: 0, contractType: 'temporal', dateMode: 'range',
      dateRangeStart: '2026-09-01', dateRangeEnd: '2026-11-30', daysOfWeek: [1, 2, 3, 4, 5],
      excludeSundays: true, excludeHolidays: true, holidayTypesExcluded: ['nacional', 'autonomico'],
      shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0, unitType: 'hora', quantity: 1,
      ivaPercent: 21, enabledSurcharges: ['nocturnidad'],
    };
    const clone = cloneServiceBlockForReinforcement(source);
    expect(clone.id).toBeUndefined();
    expect(clone.serviceName).toBe('Enfermería · Refuerzo');
    expect(clone).toMatchObject({
      professionalCategory: 'nurse', contractType: 'temporal', dateRangeStart: '2026-09-01',
      dateRangeEnd: '2026-11-30', shiftType: 'morning', ivaPercent: 21,
    });
    expect(clone.daysOfWeek).not.toBe(source.daysOfWeek);
    expect(clone.enabledSurcharges).not.toBe(source.enabledSurcharges);
  });
});
