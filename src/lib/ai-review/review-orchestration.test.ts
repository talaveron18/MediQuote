import { describe, expect, it } from 'vitest';
import { demoReviews, DEMO_SNAPSHOT } from './demo-provider';
import { completeReviewerSet } from './review-orchestration';

describe('orquestación tolerante a fallos', () => {
  it('conserva tres revisores y bloquea el cuarto si falla', () => {
    const [gestoria, finanzas, auditor] = demoReviews(DEMO_SNAPSHOT);
    const reviews = completeReviewerSet({ gestoria, finanzas, auditor });
    expect(reviews).toHaveLength(4);
    expect(reviews.find((review) => review.reviewer === 'legal')?.findings[0].id).toBe('reviewer-failed-legal');
    expect(reviews.find((review) => review.reviewer === 'legal')?.status).toBe('no_apto');
  });
});
