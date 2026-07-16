import municipalityRows from '@/data/municipalities.json';
import type { PlusFormula, PlusHourBucket } from './costing/cost-types';

export const AUTONOMOUS_COMMUNITIES = ['Madrid', 'Castilla y León', 'Castilla-La Mancha'] as const;
export type SupportedAutonomousCommunity = typeof AUTONOMOUS_COMMUNITIES[number];

export const PROVINCES_BY_COMMUNITY: Record<SupportedAutonomousCommunity, string[]> = {
  Madrid: ['Madrid'],
  'Castilla y León': ['Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora'],
  'Castilla-La Mancha': ['Albacete', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Toledo'],
};

export interface MunicipalityOption {
  ineCode: string;
  autonomousCommunity: SupportedAutonomousCommunity;
  province: string;
  name: string;
}

export interface TerritorialPlusDefinition {
  bucket: PlusHourBucket;
  legalParameterKey: string;
  formula: PlusFormula;
  label?: string;
  /** Para importes por noche/turno: convierte horas territoriales en unidades de plus. */
  unitHours?: number;
}

export interface TerritorialSpecialPlusDefinition {
  legalParameterKey: string;
  baseLegalParameterKey?: string;
  label: string;
  /** Fechas MM-DD en las que el convenio considera el turno de especial significación. */
  monthDays: string[];
  shiftTypes?: Array<'morning' | 'afternoon' | 'night' | '24h' | 'custom'>;
}

export interface ConventionProfile {
  id: string;
  label: string;
  legalRecordKey: string;
  annualConventionHoursKey: string;
  annualProductiveHoursKey: string;
  plusRules: TerritorialPlusDefinition[];
  specialPlusRules?: TerritorialSpecialPlusDefinition[];
}

const percentageNight = (key: string): TerritorialPlusDefinition => ({
  bucket: 'night', legalParameterKey: key, formula: 'percentage_base_hour',
});
const fixedNight = (key: string): TerritorialPlusDefinition => ({
  bucket: 'night', legalParameterKey: key, formula: 'per_shift', unitHours: 8,
});
const fixedShift = (bucket: PlusHourBucket, key: string): TerritorialPlusDefinition => ({
  bucket, legalParameterKey: key, formula: 'per_shift',
});
const perHour = (bucket: PlusHourBucket, key: string, label?: string): TerritorialPlusDefinition => ({
  bucket, legalParameterKey: key, formula: 'per_hour', label,
});
const noPlus = (bucket: PlusHourBucket, key: string): TerritorialPlusDefinition => ({
  bucket, legalParameterKey: key, formula: 'per_hour', label: 'Sin plus adicional según convenio',
});
const holidayRules = (key: string): TerritorialPlusDefinition[] => [
  fixedShift('holidayNational', key),
  fixedShift('holidayAutonomico', key),
  fixedShift('holidayProvincial', key),
  fixedShift('holidayMunicipal', key),
];
const noHolidayRules = (key: string): TerritorialPlusDefinition[] => [
  noPlus('holidayNational', key),
  noPlus('holidayAutonomico', key),
  noPlus('holidayProvincial', key),
  noPlus('holidayMunicipal', key),
];

export const CONVENTION_PROFILES: Record<string, ConventionProfile> = {
  madrid: {
    id: 'madrid',
    label: 'Establecimientos sanitarios de la Comunidad de Madrid 2023-2026',
    legalRecordKey: 'conv_madrid',
    annualConventionHoursKey: 'JORNADA_MADRID_ANUAL',
    annualProductiveHoursKey: 'HORAS_FACTURABLES_MADRID',
    plusRules: [
      percentageNight('PLUS_NOCTURNIDAD_MADRID'),
      noPlus('sunday', 'SIN_PLUS_DOMINGO_MADRID'),
      noPlus('weekend', 'SIN_PLUS_SABADO_MADRID'),
      ...holidayRules('PLUS_FESTIVO_MADRID'),
    ],
    specialPlusRules: [
      { legalParameterKey: 'PLUS_FESTIVO_ESPECIAL_MADRID', label: 'Noche previa a festivo especial', monthDays: ['12-24', '12-31'], shiftTypes: ['night'] },
      { legalParameterKey: 'PLUS_FESTIVO_ESPECIAL_MADRID', baseLegalParameterKey: 'PLUS_FESTIVO_MADRID', label: '25 de diciembre y 1 de enero', monthDays: ['12-25', '01-01'], shiftTypes: ['morning', 'afternoon', '24h', 'custom'] },
    ],
  },
  burgos_extension: {
    id: 'burgos_extension',
    label: 'Hospitalización y asistencia privada de Burgos y extensión vigente',
    legalRecordKey: 'conv_burgos_extension',
    annualConventionHoursKey: 'JORNADA_BURGOS_ANUAL',
    annualProductiveHoursKey: 'HORAS_FACTURABLES_BURGOS',
    plusRules: [
      percentageNight('PLUS_NOCTURNIDAD_BURGOS'),
      fixedShift('sunday', 'PLUS_DOMINGO_BURGOS'),
      noPlus('weekend', 'SIN_PLUS_SABADO_BURGOS'),
      ...holidayRules('PLUS_FESTIVO_BURGOS'),
    ],
    specialPlusRules: [{
      legalParameterKey: 'PLUS_FESTIVO_BURGOS',
      label: '24 y 31 de diciembre considerados festivos por convenio',
      monthDays: ['12-24', '12-31'],
    }],
  },
  leon: {
    id: 'leon',
    label: 'Hospitalización y asistencia privada de León (ultraactividad)',
    legalRecordKey: 'conv_leon',
    annualConventionHoursKey: 'JORNADA_LEON_ANUAL',
    annualProductiveHoursKey: 'HORAS_FACTURABLES_LEON',
    plusRules: [
      percentageNight('PLUS_NOCTURNIDAD_LEON'),
      noPlus('sunday', 'SIN_PLUS_DOMINGO_LEON'),
      noPlus('weekend', 'SIN_PLUS_SABADO_LEON'),
      ...noHolidayRules('SIN_PLUS_FESTIVO_LEON'),
    ],
  },
  palencia: {
    id: 'palencia',
    label: 'Servicios sanitarios y sociosanitarios privados de Palencia 2023-2025 (ultraactividad)',
    legalRecordKey: 'conv_palencia',
    annualConventionHoursKey: 'JORNADA_PALENCIA_ANUAL',
    annualProductiveHoursKey: 'HORAS_FACTURABLES_PALENCIA',
    plusRules: [
      perHour('night', 'PLUS_NOCTURNIDAD_HORA_PALENCIA', 'Prorrata horaria del plus mensual de nocturnidad'),
      fixedShift('sunday', 'PLUS_DOMINGO_PALENCIA'),
      noPlus('weekend', 'SIN_PLUS_SABADO_PALENCIA'),
      fixedShift('holidayNational', 'PLUS_FESTIVO_PALENCIA'),
      fixedShift('holidayAutonomico', 'PLUS_FESTIVO_PALENCIA'),
      fixedShift('holidayProvincial', 'PLUS_FESTIVO_PALENCIA'),
      fixedShift('holidayMunicipal', 'PLUS_FESTIVO_PALENCIA'),
    ],
  },
  salamanca_clm: {
    id: 'salamanca_clm',
    label: 'II Convenio de sanidad privada de Salamanca 2024-2027 (extendido a Castilla-La Mancha)',
    legalRecordKey: 'conv_salamanca_clm',
    annualConventionHoursKey: 'JORNADA_SALAMANCA_CLM_ANUAL',
    annualProductiveHoursKey: 'HORAS_FACTURABLES_SALAMANCA_CLM',
    plusRules: [
      fixedNight('PLUS_NOCTURNIDAD_SALAMANCA_CLM'),
      fixedShift('sunday', 'PLUS_DOMINGO_SALAMANCA_CLM'),
      noPlus('weekend', 'SIN_PLUS_SABADO_SALAMANCA_CLM'),
      fixedShift('holidayNational', 'PLUS_FESTIVO_SALAMANCA_CLM'),
      fixedShift('holidayAutonomico', 'PLUS_FESTIVO_SALAMANCA_CLM'),
      fixedShift('holidayProvincial', 'PLUS_FESTIVO_SALAMANCA_CLM'),
      fixedShift('holidayMunicipal', 'PLUS_FESTIVO_SALAMANCA_CLM'),
    ],
    specialPlusRules: [
      { legalParameterKey: 'PLUS_FESTIVO_ESPECIAL_SALAMANCA_CLM', label: 'Nochebuena y Nochevieja', monthDays: ['12-24', '12-31'], shiftTypes: ['night', '24h'] },
      { legalParameterKey: 'PLUS_FESTIVO_ESPECIAL_SALAMANCA_CLM', baseLegalParameterKey: 'PLUS_FESTIVO_SALAMANCA_CLM', label: 'Navidad, Año Nuevo y Reyes', monthDays: ['12-25', '01-01', '01-06'], shiftTypes: ['morning', 'afternoon', '24h'] },
      { legalParameterKey: 'PLUS_FESTIVO_ESPECIAL_SALAMANCA_CLM', label: 'Tarde de Reyes', monthDays: ['01-05'], shiftTypes: ['afternoon', '24h'] },
    ],
  },
  valladolid: {
    id: 'valladolid',
    label: 'Sanidad privada de Valladolid 2021-2025 (ultraactividad)',
    legalRecordKey: 'conv_valladolid',
    annualConventionHoursKey: 'JORNADA_VALLADOLID_ANUAL',
    annualProductiveHoursKey: 'HORAS_FACTURABLES_VALLADOLID',
    plusRules: [
      perHour('night', 'PLUS_NOCTURNIDAD_HORA_VALLADOLID', 'Nocturnidad proporcional por hora'),
      fixedShift('sunday', 'PLUS_FESTIVO_VALLADOLID'),
      noPlus('weekend', 'SIN_PLUS_SABADO_VALLADOLID'),
      fixedShift('holidayNational', 'PLUS_FESTIVO_VALLADOLID'),
      fixedShift('holidayAutonomico', 'PLUS_FESTIVO_VALLADOLID'),
      fixedShift('holidayProvincial', 'PLUS_FESTIVO_VALLADOLID'),
      fixedShift('holidayMunicipal', 'PLUS_FESTIVO_VALLADOLID'),
    ],
    specialPlusRules: [
      { legalParameterKey: 'PLUS_FESTIVO_ESPECIAL_VALLADOLID', label: 'Nochebuena y Nochevieja', monthDays: ['12-24', '12-31'], shiftTypes: ['night', '24h'] },
      { legalParameterKey: 'PLUS_FESTIVO_ESPECIAL_VALLADOLID', baseLegalParameterKey: 'PLUS_FESTIVO_VALLADOLID', label: 'Navidad, Año Nuevo y Reyes', monthDays: ['12-25', '01-01', '01-06'] },
    ],
  },
  zamora: {
    id: 'zamora',
    label: 'Hospitalización y asistencia privada de Zamora 2022-2026',
    legalRecordKey: 'conv_zamora',
    annualConventionHoursKey: 'JORNADA_ZAMORA_ANUAL',
    annualProductiveHoursKey: 'HORAS_FACTURABLES_ZAMORA',
    plusRules: [
      perHour('night', 'PLUS_NOCTURNIDAD_HORA_ZAMORA', 'Nocturnidad proporcional por hora'),
      fixedShift('sunday', 'PLUS_FESTIVO_ZAMORA'),
      noPlus('weekend', 'SIN_PLUS_SABADO_ZAMORA'),
      fixedShift('holidayNational', 'PLUS_FESTIVO_ZAMORA'),
      fixedShift('holidayAutonomico', 'PLUS_FESTIVO_ZAMORA'),
      fixedShift('holidayProvincial', 'PLUS_FESTIVO_ZAMORA'),
      fixedShift('holidayMunicipal', 'PLUS_FESTIVO_ZAMORA'),
    ],
    specialPlusRules: [
      { legalParameterKey: 'PLUS_FESTIVO_ESPECIAL_ZAMORA', label: 'Nochebuena y Nochevieja', monthDays: ['12-24', '12-31'], shiftTypes: ['night', '24h'] },
      { legalParameterKey: 'PLUS_FESTIVO_ESPECIAL_ZAMORA', baseLegalParameterKey: 'PLUS_FESTIVO_ZAMORA', label: 'Navidad y Año Nuevo', monthDays: ['12-25', '01-01'], shiftTypes: ['morning', 'afternoon', '24h'] },
      { legalParameterKey: 'PLUS_FESTIVO_ESPECIAL_ZAMORA', baseLegalParameterKey: 'PLUS_FESTIVO_ZAMORA', label: 'Primero de mayo', monthDays: ['05-01'] },
    ],
  },
};

const PROFILE_BY_PROVINCE: Record<string, keyof typeof CONVENTION_PROFILES> = {
  Madrid: 'madrid',
  'Ávila': 'burgos_extension',
  Burgos: 'burgos_extension',
  Segovia: 'burgos_extension',
  Soria: 'burgos_extension',
  León: 'leon',
  Palencia: 'palencia',
  Salamanca: 'salamanca_clm',
  Valladolid: 'valladolid',
  Zamora: 'zamora',
  Albacete: 'salamanca_clm',
  'Ciudad Real': 'salamanca_clm',
  Cuenca: 'salamanca_clm',
  Guadalajara: 'salamanca_clm',
  Toledo: 'salamanca_clm',
};

export interface ServiceLocation {
  id: string;
  label: string;
  autonomousCommunity: SupportedAutonomousCommunity;
  province: string;
  municipality: string;
  municipalityIneCode: string;
  conventionProfileId: string;
}

export const MUNICIPALITIES = municipalityRows as MunicipalityOption[];
export const DEFAULT_SERVICE_LOCATION_ID = 'ine-280796';

export function getProvincesForCommunity(community?: string | null): string[] {
  if (!community || !AUTONOMOUS_COMMUNITIES.includes(community as SupportedAutonomousCommunity)) return [];
  return PROVINCES_BY_COMMUNITY[community as SupportedAutonomousCommunity];
}

export function getMunicipalitiesForProvince(community?: string | null, province?: string | null): MunicipalityOption[] {
  if (!community || !province || !getProvincesForCommunity(community).includes(province)) return [];
  return MUNICIPALITIES.filter((row) => row.autonomousCommunity === community && row.province === province);
}

export function getConventionProfileForProvince(province: string): ConventionProfile | null {
  const profileId = PROFILE_BY_PROVINCE[province];
  return profileId ? CONVENTION_PROFILES[profileId] : null;
}

export function buildServiceLocation(municipality: MunicipalityOption): ServiceLocation {
  const profile = getConventionProfileForProvince(municipality.province);
  if (!profile) throw new Error(`No existe convenio territorial configurado para ${municipality.province}`);
  return {
    id: `ine-${municipality.ineCode}`,
    label: `${municipality.autonomousCommunity} · ${municipality.province} · ${municipality.name}`,
    autonomousCommunity: municipality.autonomousCommunity,
    province: municipality.province,
    municipality: municipality.name,
    municipalityIneCode: municipality.ineCode,
    conventionProfileId: profile.id,
  };
}

export function resolveServiceLocation(input?: {
  id?: string | null;
  cc?: string | null;
  province?: string | null;
  municipality?: string | null;
} | null): ServiceLocation | null {
  if (!input) return buildServiceLocation(MUNICIPALITIES.find((row) => row.ineCode === '280796')!);
  const ineCode = input.id?.startsWith('ine-') ? input.id.slice(4) : null;
  const match = ineCode
    ? MUNICIPALITIES.find((row) => row.ineCode === ineCode)
    : MUNICIPALITIES.find((row) => row.autonomousCommunity === input.cc
      && row.province === input.province && row.name === input.municipality);
  return match ? buildServiceLocation(match) : null;
}

/** Compatibilidad con formularios anteriores: el catálogo ya contiene localidades, no zonas genéricas. */
export const SERVICE_LOCATIONS: ServiceLocation[] = MUNICIPALITIES.map(buildServiceLocation);

export function getServiceLocation(id?: string | null): ServiceLocation {
  return resolveServiceLocation({ id: id || DEFAULT_SERVICE_LOCATION_ID })
    ?? resolveServiceLocation({ id: DEFAULT_SERVICE_LOCATION_ID })!;
}
