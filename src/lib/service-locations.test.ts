import { describe, expect, it } from 'vitest';
import {
  AUTONOMOUS_COMMUNITIES,
  CONVENTION_PROFILES,
  getConventionProfileForProvince,
  getMunicipalitiesForProvince,
  getProvincesForCommunity,
  resolveServiceLocation,
} from './service-locations';

describe('Catálogo territorial GASI', () => {
  it('solo ofrece las tres comunidades soportadas y sus provincias correctas', () => {
    expect(AUTONOMOUS_COMMUNITIES).toEqual(['Madrid', 'Castilla y León', 'Castilla-La Mancha']);
    expect(getProvincesForCommunity('Castilla-La Mancha')).toEqual([
      'Albacete', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Toledo',
    ]);
    expect(getProvincesForCommunity('Castilla y León')).toHaveLength(9);
    expect(getProvincesForCommunity('Cataluña')).toEqual([]);
  });

  it('impide cruces imposibles entre comunidad, provincia y localidad', () => {
    expect(getMunicipalitiesForProvince('Castilla-La Mancha', 'Madrid')).toEqual([]);
    expect(resolveServiceLocation({ cc: 'Castilla-La Mancha', province: 'Madrid', municipality: 'Madrid' })).toBeNull();
    expect(resolveServiceLocation({ cc: 'Castilla-La Mancha', province: 'Toledo', municipality: 'Toledo' }))
      .toMatchObject({ autonomousCommunity: 'Castilla-La Mancha', province: 'Toledo', municipality: 'Toledo' });
  });

  it('asigna el convenio profesional que corresponde a cada provincia', () => {
    expect(getConventionProfileForProvince('Madrid')?.id).toBe('madrid');
    expect(getConventionProfileForProvince('Ávila')?.id).toBe('burgos_extension');
    expect(getConventionProfileForProvince('León')?.id).toBe('leon');
    expect(getConventionProfileForProvince('Valladolid')?.id).toBe('valladolid');
    expect(getConventionProfileForProvince('Toledo')?.id).toBe('salamanca_clm');
  });

  it('no deja que recargos genéricos sustituyan silenciosamente al convenio provincial', () => {
    const required = ['night', 'sunday', 'weekend', 'holidayNational', 'holidayAutonomico', 'holidayProvincial', 'holidayMunicipal'];
    for (const profile of Object.values(CONVENTION_PROFILES)) {
      const buckets = new Set(profile.plusRules.map((rule) => rule.bucket));
      for (const bucket of required) expect([...buckets], `${profile.id}: ${bucket}`).toContain(bucket);
    }
  });
});
