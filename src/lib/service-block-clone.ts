import type { ServiceBlockInput } from './types';

/** Clona una ficha completa sin reutilizar su id persistido. */
export function cloneServiceBlockForReinforcement(source: ServiceBlockInput): ServiceBlockInput {
  return {
    ...source,
    id: undefined,
    serviceName: `${source.serviceName || 'Servicio profesional'} · Refuerzo`,
    specificDates: [...(source.specificDates ?? [])],
    daysOfWeek: [...(source.daysOfWeek ?? [])],
    holidayTypesExcluded: [...(source.holidayTypesExcluded ?? [])],
    enabledSurcharges: [...(source.enabledSurcharges ?? [])],
  };
}

function copyBlock(source: ServiceBlockInput): ServiceBlockInput {
  return {
    ...source,
    id: undefined,
    specificDates: [...(source.specificDates ?? [])],
    daysOfWeek: [...(source.daysOfWeek ?? [])],
    holidayTypesExcluded: [...(source.holidayTypesExcluded ?? [])],
    enabledSurcharges: [...(source.enabledSurcharges ?? [])],
  };
}

function timeAt(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  return `${String(Math.floor(normalized)).padStart(2, '0')}:00`;
}

function withExactDates(source: ServiceBlockInput, dates: string[]): ServiceBlockInput {
  return {
    ...copyBlock(source),
    dateMode: 'specific',
    dateUIMode: 'specific',
    specificDates: [...dates],
    dateRangeStart: undefined,
    dateRangeEnd: undefined,
    daysOfWeek: [],
    excludeSundays: false,
    excludeHolidays: false,
    holidayTypesExcluded: [],
    plantillaSeleccionada: 1,
  };
}

/**
 * Reparte una cobertura ya calculada entre contratos sin duplicar horas.
 * En servicios ordinarios alterna fechas. En coberturas de 24 h crea turnos
 * complementarios y rota sus fechas entre los profesionales de cada turno.
 */
export function splitServiceBlockForReinforcement(params: {
  source: ServiceBlockInput;
  workingDates: string[];
  professionals: number;
}): ServiceBlockInput[] {
  const dates = [...new Set(params.workingDates)].sort();
  const requested = Math.max(2, Math.floor(params.professionals));
  if (!dates.length) throw new Error('Calcula primero las fechas de cobertura');

  if (params.source.shiftType !== '24h' && params.source.hoursPerDay < 24) {
    const count = Math.min(requested, dates.length);
    const groups = Array.from({ length: count }, () => [] as string[]);
    dates.forEach((date, index) => groups[index % count].push(date));
    return groups.map((group, index) => ({
      ...withExactDates(params.source, group),
      serviceName: `${params.source.serviceName || 'Servicio profesional'} · Profesional ${index + 1}/${count}`,
    }));
  }

  const shiftCount = Math.min(3, requested);
  const duration = 24 / shiftCount;
  const workersByShift = Array.from({ length: shiftCount }, (_, shift) =>
    Array.from({ length: Math.floor(requested / shiftCount) + (shift < requested % shiftCount ? 1 : 0) }, () => [] as string[]));
  for (let shift = 0; shift < shiftCount; shift++) {
    dates.forEach((date, index) => workersByShift[shift][index % workersByShift[shift].length].push(date));
  }
  const blocks: ServiceBlockInput[] = [];
  for (let shift = 0; shift < shiftCount; shift++) {
    const start = shift * duration;
    const end = (shift + 1) * duration;
    workersByShift[shift].forEach((group, worker) => blocks.push({
      ...withExactDates(params.source, group),
      serviceName: `${params.source.serviceName || 'Servicio profesional'} · Turno ${shift + 1} · Profesional ${worker + 1}`,
      shiftType: 'custom',
      shiftStartTime: timeAt(start),
      shiftEndTime: timeAt(end),
      hoursPerDay: duration,
    }));
  }
  return blocks;
}
