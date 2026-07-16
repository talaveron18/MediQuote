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

