import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSessionToken,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from './session';

const TEST_SECRET = 'test-session-secret-with-more-than-thirty-two-bytes';

describe('Signed session token', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('SESSION_SECRET', TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a valid signed and unexpired token with generation', () => {
    const token = createSessionToken('user-123', 3, 1_000);

    expect(verifySessionToken(token, 1_001)).toEqual({
      userId: 'user-123',
      generation: 3,
      issuedAt: 1_000,
      expiresAt: 1_000 + SESSION_MAX_AGE_SECONDS,
    });
  });

  it('rejects the former raw-email cookie', () => {
    expect(verifySessionToken('fernando.suarez@gasisalud.com', 1_001)).toBeNull();
  });

  it('rejects payload and signature manipulation', () => {
    const token = createSessionToken('commercial-user', 2, 1_000);
    const [version, payload, tokenSignature] = token.split('.');
    const manipulatedPayload = Buffer.from(JSON.stringify({
      sub: 'maestro-user',
      gen: 2,
      iat: 1_000,
      exp: 1_000 + SESSION_MAX_AGE_SECONDS,
    })).toString('base64url');

    expect(
      verifySessionToken(`${version}.${manipulatedPayload}.${tokenSignature}`, 1_001),
    ).toBeNull();
    expect(
      verifySessionToken(`${version}.${payload}.${tokenSignature.slice(0, -1)}A`, 1_001),
    ).toBeNull();
  });

  it('rejects expired tokens', () => {
    const token = createSessionToken('user-123', 1, 1_000);

    expect(verifySessionToken(token, 1_000 + SESSION_MAX_AGE_SECONDS)).toBeNull();
  });

  it('rejects invalid generations', () => {
    expect(() => createSessionToken('user-123', 0, 1_000)).toThrow(/generación/);
  });

  it('requires a strong configured secret in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SESSION_SECRET', 'short');

    expect(() => createSessionToken('user-123', 1, 1_000)).toThrow(/SESSION_SECRET/);
  });
});
