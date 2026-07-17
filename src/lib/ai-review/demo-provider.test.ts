import { describe, expect, it } from 'vitest';
import { buildDemoBundle, demoIntake, DEMO_INTAKE_TEXT, DEMO_SNAPSHOT } from './demo-provider';

describe('modo demostración', () => {
  it('funciona sin clave y entrega cuatro revisores distintos', () => {
    const bundle = buildDemoBundle(DEMO_SNAPSHOT);
    expect(bundle.mode).toBe('demo'); expect(bundle.reviews.map((r) => r.reviewer).sort()).toEqual(['auditor', 'finanzas', 'gestoria', 'legal']);
  });
  it('transforma lenguaje natural en borrador confirmable', () => {
    const draft = demoIntake(DEMO_INTAKE_TEXT);
    expect(draft.province).toBe('Toledo'); expect(draft.pendingConfirmation).toContain('Causa legal de temporalidad');
  });
});
