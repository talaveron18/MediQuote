import { describe, expect, it } from 'vitest';
import { demoReviews, DEMO_SNAPSHOT } from './demo-provider';
import { buildJointVerdict, buildProsecutorView } from './verdict';

describe('consejo conjunto', () => {
  it('un crítico bloquea el veredicto aunque el resto sea favorable', () => {
    const reviews = demoReviews(DEMO_SNAPSHOT);
    const verdict = buildJointVerdict(reviews);
    expect(verdict.status).toBe('no_apto'); expect(verdict.criticalCount).toBe(1); expect(verdict.blockingFindingIds).toContain('aud-turno');
  });
  it('el fiscal exige evidencias', () => {
    expect(buildProsecutorView(demoReviews(DEMO_SNAPSHOT)).evidenceToRequest.length).toBeGreaterThan(1);
  });
});
