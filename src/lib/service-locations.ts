export interface ServiceLocation {
  id: string;
  label: string;
  autonomousCommunity: string;
  province: string;
  municipality?: string;
}

export const SERVICE_LOCATIONS: ServiceLocation[] = [
  {
    id: 'madrid-capital',
    label: 'Madrid (capital)',
    autonomousCommunity: 'Madrid',
    province: 'Madrid',
    municipality: 'Madrid',
  },
  {
    id: 'burgos-capital',
    label: 'Burgos (capital)',
    autonomousCommunity: 'Castilla y León',
    province: 'Burgos',
    municipality: 'Burgos',
  },
  {
    id: 'castilla-leon',
    label: 'Castilla y León (calendario autonómico)',
    autonomousCommunity: 'Castilla y León',
    province: 'Castilla y León',
  },
  {
    id: 'castilla-la-mancha',
    label: 'Castilla-La Mancha (calendario autonómico)',
    autonomousCommunity: 'Castilla-La Mancha',
    province: 'Castilla-La Mancha',
  },
];

export const DEFAULT_SERVICE_LOCATION_ID = 'madrid-capital';

export function getServiceLocation(id?: string | null): ServiceLocation {
  return SERVICE_LOCATIONS.find((location) => location.id === id)
    ?? SERVICE_LOCATIONS[0];
}

