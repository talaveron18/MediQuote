import { describe, expect, it } from 'vitest';
import { filterHolidaysForLocation } from './holiday-location';

describe('holiday territory filtering', () => {
  it('does not apply a Cataluña holiday to a Madrid service', () => {
    const holidays = filterHolidaysForLocation([
      { date: '2026-09-11', name: 'Diada', type: 'autonomico', autonomousCommunity: 'Cataluña' },
      { date: '2026-09-11', name: 'Registro mal clasificado', type: 'nacional', autonomousCommunity: 'Cataluña' },
      { date: '2026-10-12', name: 'Fiesta Nacional', type: 'nacional' },
    ], { cc: 'Madrid', province: 'Madrid', municipality: 'Madrid' });
    expect(holidays.map((holiday) => holiday.name)).toEqual(['Fiesta Nacional']);
  });

  it('only applies provincial and municipal holidays to their service territory', () => {
    const holidays = filterHolidaysForLocation([
      { date: '2026-06-29', name: 'Burgos', type: 'provincial', province: 'Burgos' },
      { date: '2026-06-12', name: 'El Curpillos', type: 'municipal', municipality: 'Burgos' },
    ], { cc: 'Castilla y León', province: 'Burgos', municipality: 'Burgos' });
    expect(holidays).toHaveLength(2);
  });
});
