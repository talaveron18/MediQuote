import { afterEach, describe, expect, it } from 'vitest'
import { buildPasswordRecoveryEmail, validatePasswordRecoveryDeliveryConfig } from './password-recovery-delivery'

afterEach(() => {
  delete process.env.GASI_RECOVERY_SMTP_HOST
  delete process.env.GASI_RECOVERY_SMTP_PORT
  delete process.env.GASI_RECOVERY_SMTP_FROM
  delete process.env.GASI_RECOVERY_SMTP_PASSWORD
})

describe('validatePasswordRecoveryDeliveryConfig', () => {
  it('requires every non-public SMTP parameter instead of guessing defaults', () => {
    expect(() => validatePasswordRecoveryDeliveryConfig({
      host: '', port: '', from: '', password: '',
    })).toThrow(/SMTP_HOST/)

    expect(() => validatePasswordRecoveryDeliveryConfig({
      host: 'smtp.example.invalid', port: '', from: 'recovery@example.invalid', password: 'secret',
    })).toThrow(/SMTP_PORT/)

    expect(() => validatePasswordRecoveryDeliveryConfig({
      host: 'smtp.example.invalid', port: '587', from: '', password: 'secret',
    })).toThrow(/SMTP_FROM/)

    expect(() => validatePasswordRecoveryDeliveryConfig({
      host: 'smtp.example.invalid', port: '587', from: 'recovery@example.invalid', password: '',
    })).toThrow(/SMTP_PASSWORD/)
  })

  it('uses the complete corporate mailbox as SMTP username without exposing the password', () => {
    const password = 'Synthetic-Smtp-Secret-2026!'
    const config = validatePasswordRecoveryDeliveryConfig({
      host: 'smtp.example.invalid',
      port: '587',
      from: 'Recovery@Example.invalid',
      password,
    })
    expect(config).toEqual({
      host: 'smtp.example.invalid',
      port: 587,
      from: 'recovery@example.invalid',
      username: 'recovery@example.invalid',
      password,
    })
    expect(JSON.stringify({ ...config, password: '[redacted]' })).not.toContain(password)
  })

  it('rejects hosts, ports and mailboxes that could inject SMTP commands', () => {
    expect(() => validatePasswordRecoveryDeliveryConfig({
      host: 'smtp.example.invalid\r\nRCPT TO:x@example.invalid',
      port: '587',
      from: 'recovery@example.invalid',
      password: 'secret',
    })).toThrow(/servidor válido/)

    expect(() => validatePasswordRecoveryDeliveryConfig({
      host: 'smtp.example.invalid', port: '70000', from: 'recovery@example.invalid', password: 'secret',
    })).toThrow(/PORT/)

    expect(() => validatePasswordRecoveryDeliveryConfig({
      host: 'smtp.example.invalid', port: '587', from: 'recovery@example.invalid\r\nBcc:x@example.invalid', password: 'secret',
    })).toThrow(/dirección válida/)
  })
})

describe('buildPasswordRecoveryEmail', () => {
  it('builds a plain-text one-use-link message without user-controlled headers', () => {
    const result = buildPasswordRecoveryEmail({
      recipient: 'synthetic@example.invalid',
      resetUrl: 'https://mediquote.example.invalid/restablecer-password?token=synthetic-token',
      expiresAt: new Date('2026-09-12T03:00:00Z'),
    }, 'recovery@example.invalid')

    expect(result.recipient).toBe('synthetic@example.invalid')
    expect(result.message).toContain('From: GASI MediQuote <recovery@example.invalid>')
    expect(result.message).toContain('To: synthetic@example.invalid')
    expect(result.message).toContain('https://mediquote.example.invalid/restablecer-password?token=synthetic-token')
    expect(result.message).toContain('Auto-Submitted: auto-generated')
  })

  it('rejects recipient header injection and any non-HTTPS reset URL', () => {
    expect(() => buildPasswordRecoveryEmail({
      recipient: 'synthetic@example.invalid\r\nBcc:attacker@example.invalid',
      resetUrl: 'https://mediquote.example.invalid/restablecer-password?token=x',
      expiresAt: new Date('2026-09-12T03:00:00Z'),
    }, 'recovery@example.invalid')).toThrow(/Destinatario/)

    for (const resetUrl of [
      'http://mediquote.example.invalid/restablecer-password?token=x',
      'javascript:alert(1)',
      'ftp://mediquote.example.invalid/token',
    ]) {
      expect(() => buildPasswordRecoveryEmail({
        recipient: 'synthetic@example.invalid',
        resetUrl,
        expiresAt: new Date('2026-09-12T03:00:00Z'),
      }, 'recovery@example.invalid')).toThrow(/URL/)
    }
  })
})
