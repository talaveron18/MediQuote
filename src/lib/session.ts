import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

const TOKEN_VERSION = 'v2';
const MINIMUM_SECRET_BYTES = 32;
const DEVELOPMENT_SECRET = 'mediquote-development-session-secret-do-not-use-in-production';

type SessionPayload = {
  sub: string;
  gen: number;
  iat: number;
  exp: number;
};

export type VerifiedSession = {
  userId: string;
  generation: number;
  issuedAt: number;
  expiresAt: number;
};

function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && Buffer.byteLength(configured, 'utf8') >= MINIMUM_SECRET_BYTES) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET debe estar configurado con al menos 32 bytes.');
  }
  return DEVELOPMENT_SECRET;
}

function signature(value: string): string {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

export function createSessionToken(
  userId: string,
  generation = 1,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  if (!userId.trim()) throw new Error('No se puede crear una sesión sin usuario.');
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new Error('La generación de sesión debe ser un entero positivo.');
  }

  const payload: SessionPayload = {
    sub: userId,
    gen: generation,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signedValue = `${TOKEN_VERSION}.${encodedPayload}`;
  return `${signedValue}.${signature(signedValue)}`;
}

export function verifySessionToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedSession | null {
  try {
    const [version, encodedPayload, suppliedSignature, ...extra] = token.split('.');
    if (
      version !== TOKEN_VERSION
      || !encodedPayload
      || !suppliedSignature
      || extra.length > 0
    ) return null;

    const expectedSignature = signature(`${version}.${encodedPayload}`);
    const suppliedBuffer = Buffer.from(suppliedSignature, 'base64url');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
    if (
      suppliedBuffer.length !== expectedBuffer.length
      || !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) return null;

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<SessionPayload>;
    if (
      typeof payload.sub !== 'string'
      || !payload.sub
      || !Number.isSafeInteger(payload.gen)
      || payload.gen! < 1
      || !Number.isInteger(payload.iat)
      || !Number.isInteger(payload.exp)
      || payload.iat! > nowSeconds + 60
      || payload.exp! <= nowSeconds
      || payload.exp! - payload.iat! !== SESSION_MAX_AGE_SECONDS
    ) return null;

    return {
      userId: payload.sub,
      generation: payload.gen!,
      issuedAt: payload.iat!,
      expiresAt: payload.exp!,
    };
  } catch {
    return null;
  }
}
