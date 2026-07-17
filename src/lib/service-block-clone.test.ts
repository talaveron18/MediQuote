import { describe, expect, it } from 'vitest';
import { cloneServiceBlockForReinforcement, splitServiceBlockForReinforcement } from './service-block-clone';
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

  it('reparte las fechas ordinarias sin duplicar cobertura', () => {
    const source: ServiceBlockInput = {
      blockType: 'profesional_hora', serviceName: 'Enfermería', professionalCategory: 'nurse',
      puestosSimultaneos: 1, plantillaSeleccionada: 1, pricePerHour: 0, contractType: 'temporal',
      dateMode: 'range', dateRangeStart: '2026-09-01', dateRangeEnd: '2026-09-06', daysOfWeek: [1,2,3,4,5,6,0],
      excludeSundays: false, excludeHolidays: false, shiftType: 'morning', hoursPerDay: 8,
      breakMinutes: 0, unitType: 'hora', quantity: 1,
    };
    const dates = ['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
    const blocks = splitServiceBlockForReinforcement({ source, workingDates: dates, professionals: 2 });
    expect(blocks).toHaveLength(2);
    expect(blocks.flatMap((block) => block.specificDates ?? []).sort()).toEqual(dates);
    expect(new Set(blocks.flatMap((block) => block.specificDates ?? [])).size).toBe(dates.length);
  });

  it('divide 24 horas en turnos complementarios y conserva las horas totales', () => {
    const source: ServiceBlockInput = {
      blockType: 'profesional_hora', serviceName: 'Cobertura', professionalCategory: 'doctor',
      puestosSimultaneos: 1, plantillaSeleccionada: 1, pricePerHour: 0, contractType: 'temporal',
      dateMode: 'specific', specificDates: ['2026-09-01','2026-09-02'], daysOfWeek: [],
      excludeSundays: false, excludeHolidays: false, shiftType: '24h', hoursPerDay: 24,
      breakMinutes: 0, unitType: 'hora', quantity: 1,
    };
    const blocks = splitServiceBlockForReinforcement({ source, workingDates: source.specificDates!, professionals: 3 });
    expect(blocks.map((block) => `${block.shiftStartTime}-${block.shiftEndTime}`)).toEqual(['00:00-08:00','08:00-16:00','16:00-00:00']);
    expect(blocks.reduce((hours, block) => hours + (block.specificDates?.length ?? 0) * block.hoursPerDay, 0)).toBe(48);
  });
});
