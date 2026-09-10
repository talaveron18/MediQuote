import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const PASSWORD_RECOVERY_TOKEN_BYTES = 32
export const PASSWORD_RECOVERY_TTL_MS = 20 * 60 * 1000

export type PasswordRecoveryToken = {
  rawToken: string
  tokenHash: string
  createdAt: Date
  expiresAt: Date
}

export type PasswordRecoveryRecordState = {
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
}

export function normalizeRecoveryIdentifier(email: string): string {
  return email.trim().toLowerCase()
}

export function hashRecoveryToken(rawToken: string): string {
  if (!rawToken) throw new TypeError('El token de recuperación no puede estar vacío')
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

export function createPasswordRecoveryToken(
  now = new Date(),
  ttlMs = PASSWORD_RECOVERY_TTL_MS,
): PasswordRecoveryToken {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new TypeError('ttlMs debe ser positivo')
  const rawToken = randomBytes(PASSWORD_RECOVERY_TOKEN_BYTES).toString('base64url')
  return {
    rawToken,
    tokenHash: hashRecoveryToken(rawToken),
    createdAt: new Date(now),
    expiresAt: new Date(now.getTime() + ttlMs),
  }
}

export function recoveryTokenHashMatches(rawToken: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return false
  const actual = Buffer.from(hashRecoveryToken(rawToken), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function isRecoveryRecordUsable(
  record: PasswordRecoveryRecordState,
  rawToken: string,
  now = new Date(),
): boolean {
  if (record.usedAt !== null) return false
  if (record.expiresAt.getTime() <= now.getTime()) return false
  return recoveryTokenHashMatches(rawToken, record.tokenHash)
}
