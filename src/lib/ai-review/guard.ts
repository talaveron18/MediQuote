import { createHash } from 'node:crypto';
import type { ReviewBundle } from './types';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const CACHE_MS = 5 * 60_000;
const requests = new Map<string, number[]>();
const cache = new Map<string, { expires: number; value: ReviewBundle }>();

export function consumeReviewQuota(userId: string, now = Date.now()): boolean {
  const recent = (requests.get(userId) ?? []).filter((stamp) => stamp > now - WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) { requests.set(userId, recent); return false; }
  recent.push(now); requests.set(userId, recent); return true;
}

export function snapshotCacheKey(snapshot: unknown, mode: string): string {
  return createHash('sha256').update(`${mode}:${JSON.stringify(snapshot)}`).digest('hex');
}

export function getCachedReview(key: string, now = Date.now()): ReviewBundle | null {
  const entry = cache.get(key);
  if (!entry || entry.expires <= now) { cache.delete(key); return null; }
  return entry.value;
}

export function setCachedReview(key: string, value: ReviewBundle, now = Date.now()): void {
  cache.set(key, { expires: now + CACHE_MS, value });
  if (cache.size > 100) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}
