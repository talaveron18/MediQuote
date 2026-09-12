import { describe, expect, it } from 'vitest'
import {
  createPasswordRecoveryToken,
  isCanonicalPasswordRecoveryToken,
  isValidRecoveryIdentifier,
  MAXIMUM_RECOVERY_IDENTIFIER_LENGTH,
} from './password-recovery'
import {
  isStrongEnoughPassword,
  MAXIMUM_PASSWORD_BYTES,
  passwordUtf8Bytes,
} from './password-policy'

describe('password recovery input boundaries', () => {
  it('accepts normalized mailbox-shaped identifiers and rejects malformed or oversized identifiers', () => {
    expect(isValidRecoveryIdentifier(' User.Name+tag@Example.COM ')).toBe(true)
    expect(isValidRecoveryIdentifier('not-an-email')).toBe(false)
    expect(isValidRecoveryIdentifier('a@b')).toBe(false)
    expect(isValidRecoveryIdentifier(`${'a'.repeat(MAXIMUM_RECOVERY_IDENTIFIER_LENGTH)}@example.com`)).toBe(false)
  })

  it('only accepts canonical 32-byte base64url recovery tokens', () => {
    const token = createPasswordRecoveryToken().rawToken
    expect(token).toHaveLength(43)
    expect(isCanonicalPasswordRecoveryToken(token)).toBe(true)
    expect(isCanonicalPasswordRecoveryToken(`${token}!`)).toBe(false)
    expect(isCanonicalPasswordRecoveryToken(token.slice(1))).toBe(false)
    expect(isCanonicalPasswordRecoveryToken('A'.repeat(42) + '!')).toBe(false)
  })

  it('rejects passwords whose UTF-8 representation exceeds bcrypt 72-byte boundary', () => {
    const asciiBoundary = 'A'.repeat(MAXIMUM_PASSWORD_BYTES)
    const asciiTooLong = `${asciiBoundary}B`
    const unicodeTooLong = '🔐'.repeat(19)

    expect(passwordUtf8Bytes(asciiBoundary)).toBe(MAXIMUM_PASSWORD_BYTES)
    expect(isStrongEnoughPassword(asciiBoundary)).toBe(true)
    expect(passwordUtf8Bytes(asciiTooLong)).toBe(MAXIMUM_PASSWORD_BYTES + 1)
    expect(isStrongEnoughPassword(asciiTooLong)).toBe(false)
    expect(passwordUtf8Bytes(unicodeTooLong)).toBeGreaterThan(MAXIMUM_PASSWORD_BYTES)
    expect(isStrongEnoughPassword(unicodeTooLong)).toBe(false)
  })
})
