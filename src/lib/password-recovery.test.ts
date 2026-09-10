import { describe, expect, it } from 'vitest'
import {
  PASSWORD_RECOVERY_TOKEN_BYTES,
  PASSWORD_RECOVERY_TTL_MS,
  createPasswordRecoveryToken,
  hashRecoveryToken,
  isRecoveryRecordUsable,
  normalizeRecoveryIdentifier,
  recoveryTokenHashMatches,
} from './password-recovery'

describe('password recovery token primitives', () => {
  it('genera al menos 32 bytes aleatorios y guarda solo un hash utilizable', () => {
    const now = new Date('2026-09-10T03:00:00.000Z')
    const token = createPasswordRecoveryToken(now)

    expect(PASSWORD_RECOVERY_TOKEN_BYTES).toBeGreaterThanOrEqual(32)
    expect(token.rawToken).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(token.tokenHash).not.toContain(token.rawToken)
    expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(PASSWORD_RECOVERY_TTL_MS)
  })

  it('el hash es determinista y la comparación rechaza otro token', () => {
    expect(hashRecoveryToken('abc')).toBe(hashRecoveryToken('abc'))
    expect(recoveryTokenHashMatches('abc', hashRecoveryToken('abc'))).toBe(true)
    expect(recoveryTokenHashMatches('xyz', hashRecoveryToken('abc'))).toBe(false)
  })

  it('un token válido solo es usable antes de caducar y mientras no esté consumido', () => {
    const created = new Date('2026-09-10T03:00:00.000Z')
    const token = createPasswordRecoveryToken(created)
    const record = { tokenHash: token.tokenHash, expiresAt: token.expiresAt, usedAt: null }

    expect(isRecoveryRecordUsable(record, token.rawToken, new Date('2026-09-10T03:10:00.000Z'))).toBe(true)
    expect(isRecoveryRecordUsable(record, token.rawToken, token.expiresAt)).toBe(false)
    expect(isRecoveryRecordUsable({ ...record, usedAt: new Date('2026-09-10T03:05:00.000Z') }, token.rawToken, new Date('2026-09-10T03:10:00.000Z'))).toBe(false)
  })

  it('normaliza el identificador sin revelar si la cuenta existe', () => {
    expect(normalizeRecoveryIdentifier('  USER@Example.COM ')).toBe('user@example.com')
  })
})
