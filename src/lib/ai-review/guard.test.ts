import { describe, expect, it } from 'vitest';
import { consumeReviewQuota, getCachedReview, setCachedReview, snapshotCacheKey } from './guard';
import { buildDemoBundle, DEMO_SNAPSHOT } from './demo-provider';

describe('controles operativos de revisión', () => {
  it('limita ráfagas por usuario', () => {
    const id = `user-${Math.random()}`;
    for (let i = 0; i < 12; i += 1) expect(consumeReviewQuota(id, 1000)).toBe(true);
    expect(consumeReviewQuota(id, 1000)).toBe(false);
    expect(consumeReviewQuota(id, 62_000)).toBe(true);
  });
  it('reutiliza la misma foto durante cinco minutos', () => {
    const key = snapshotCacheKey(DEMO_SNAPSHOT, 'demo', 'user-a');
    const bundle = buildDemoBundle(DEMO_SNAPSHOT);
    setCachedReview(key, bundle, 1000);
    expect(getCachedReview(key, 2000)).toEqual(bundle);
    expect(getCachedReview(key, 302_000)).toBeNull();
  });
  it('aísla la caché entre usuarios', () => {
    expect(snapshotCacheKey(DEMO_SNAPSHOT, 'demo', 'user-a')).not.toBe(snapshotCacheKey(DEMO_SNAPSHOT, 'demo', 'user-b'));
  });
});
