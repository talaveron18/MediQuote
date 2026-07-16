export interface ServiceLocation {
  id: string;
  label: string;
  autonomousCommunity: string;
  province: string;
  municipality?: string;
  /** Clave estable del dato legal territorial; el porcentaje vive en LegalParameter. */
  nightSurchargeLegalParameterKey?: string;
}

const provinces = (autonomousCommunity: string, values: string[]): ServiceLocation[] =>
  values.map((province) => ({
    id: `${autonomousCommunity}-${province}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-'),
    label: `${autonomousCommunity} · ${province}`,
    autonomousCommunity,
    province,
    ...(province === 'Madrid' ? { municipality: 'Madrid', nightSurchargeLegalParameterKey: 'PLUS_NOCTURNIDAD_MADRID' } : {}),
    ...(province === 'Burgos' ? { nightSurchargeLegalParameterKey: 'PLUS_NOCTURNIDAD_BURGOS' } : {}),
  }));

/** Territorio de prestación: comunidad y provincia, nunca calendarios genéricos mezclados. */
export const SERVICE_LOCATIONS: ServiceLocation[] = [
  ...provinces('Madrid', ['Madrid']),
  ...provinces('Castilla y León', [
    'Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora',
  ]),
  ...provinces('Castilla-La Mancha', [
    'Albacete', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Toledo',
  ]),
];

export const DEFAULT_SERVICE_LOCATION_ID = 'madrid-madrid';

export function getServiceLocation(id?: string | null): ServiceLocation {
  return SERVICE_LOCATIONS.find((location) => location.id === id)
    ?? SERVICE_LOCATIONS[0];
}
