import { describe, expect, it } from 'vitest';
import { filterHolidaysForLocation } from './holiday-location';
import type { HolidayInfo } from './types';

describe('Aislamiento territorial de festivos', () => {
  it('no aplica un festivo catalán a Madrid aunque esté mal rotulado como nacional', () => {
    const holidays: HolidayInfo[] = [
      { date: '2026-09-11', name: 'Diada', type: 'nacional', autonomousCommunity: 'Cataluña' },
      { date: '2026-10-12', name: 'Fiesta Nacional', type: 'nacional' },
    ];
    expect(filterHolidaysForLocation(holidays, { cc: 'Madrid', province: 'Madrid', municipality: 'Madrid' }))
      .toEqual([{ date: '2026-10-12', name: 'Fiesta Nacional', type: 'nacional' }]);
  });

  it('aplica festivos autonómicos, provinciales y municipales solo a la selección exacta', () => {
    const holidays: HolidayInfo[] = [
      { date: '2026-05-31', name: 'CLM', type: 'autonomico', autonomousCommunity: 'Castilla-La Mancha' },
      { date: '2026-01-23', name: 'Toledo', type: 'provincial', province: 'Toledo' },
      { date: '2026-11-23', name: 'Local', type: 'municipal', municipality: 'Toledo' },
    ];
    expect(filterHolidaysForLocation(holidays, { cc: 'Castilla-La Mancha', province: 'Toledo', municipality: 'Toledo' })).toHaveLength(3);
    expect(filterHolidaysForLocation(holidays, { cc: 'Castilla y León', province: 'Valladolid', municipality: 'Valladolid' })).toHaveLength(0);
  });
});
