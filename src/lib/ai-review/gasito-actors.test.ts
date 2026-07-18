import { describe, expect, it } from 'vitest';
import { actorAriaLabel, councilAnimationPlan, GASITO_ACTORS, motionForState } from './gasito-actors';

describe('familia Gasito', () => {
  it('usa una única identidad Gasito para los cinco roles', () => {
    expect(GASITO_ACTORS).toHaveLength(5);
    expect(GASITO_ACTORS.every((actor) => actor.name.startsWith('Gasito'))).toBe(true);
    expect(new Set(GASITO_ACTORS.map((actor) => actor.role)).size).toBe(5);
  });

  it('el moderador no vota y Legal no promete cumplimiento', () => {
    const moderator = GASITO_ACTORS.find((actor) => actor.role === 'moderador');
    const legal = GASITO_ACTORS.find((actor) => actor.role === 'legal');
    expect(moderator?.votes).toBe(false);
    expect(legal?.specialty.toLowerCase()).not.toContain('cumplimiento garantizado');
    expect(legal?.specialty).toBe('Riesgo legal y contractual');
  });

  it('el estado controla el movimiento sin depender de temporizadores', () => {
    expect(motionForState('revisando')).toBe('primary');
    expect(motionForState('con_hallazgos')).toBe('finding');
    expect(motionForState('no_disponible')).toBe('offline');
    expect(motionForState('esperando')).toBe('idle');
  });

  it('solo el actor activo recibe movimiento principal', () => {
    const plan = councilAnimationPlan('auditor');
    expect(plan.filter((actor) => actor.primary).map((actor) => actor.role)).toEqual(['auditor']);
  });

  it('una contradicción activa emisor y destinatario de forma distinta', () => {
    const plan = councilAnimationPlan('auditor', 'gestoria');
    expect(plan.find((actor) => actor.role === 'auditor')?.primary).toBe(true);
    expect(plan.find((actor) => actor.role === 'gestoria')?.target).toBe(true);
    expect(plan.filter((actor) => actor.primary)).toHaveLength(1);
  });

  it('un actor no disponible queda marcado también en texto accesible', () => {
    expect(actorAriaLabel('legal', 'no_disponible')).toContain('No disponible');
  });
});
