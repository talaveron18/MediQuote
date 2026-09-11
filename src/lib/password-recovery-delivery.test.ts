import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliverPasswordRecoveryLink, validatePasswordRecoveryDeliveryConfig } from './password-recovery-delivery'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.PASSWORD_RESET_DELIVERY_WEBHOOK_URL
  delete process.env.PASSWORD_RESET_DELIVERY_BEARER_TOKEN
})

describe('validatePasswordRecoveryDeliveryConfig', () => {
  it('requires an authenticated HTTPS webhook in production', () => {
    expect(() => validatePasswordRecoveryDeliveryConfig({
      webhookUrl: 'https://mail.example.invalid/recovery',
      bearerToken: '',
      production: true,
    })).toThrow(/BEARER_TOKEN/)

    expect(validatePasswordRecoveryDeliveryConfig({
      webhookUrl: 'https://mail.example.invalid/recovery',
      bearerToken: 'secret-token',
      production: true,
    }).url.toString()).toBe('https://mail.example.invalid/recovery')
  })

  it('rejects non-HTTPS and embedded credentials in production', () => {
    expect(() => validatePasswordRecoveryDeliveryConfig({
      webhookUrl: 'http://mail.example.invalid/recovery', bearerToken: 'secret', production: true,
    })).toThrow(/HTTPS/)
    expect(() => validatePasswordRecoveryDeliveryConfig({
      webhookUrl: 'https://user:pass@mail.example.invalid/recovery', bearerToken: 'secret', production: true,
    })).toThrow(/credenciales/)
  })

  it('keeps development/test delivery flexible without weakening production', () => {
    const config = validatePasswordRecoveryDeliveryConfig({
      webhookUrl: 'http://127.0.0.1:9999/recovery', bearerToken: '', production: false,
    })
    expect(config.url.hostname).toBe('127.0.0.1')
    expect(config.bearerToken).toBeNull()
  })

  it('forbids redirects when delivering a reset token', async () => {
    process.env.PASSWORD_RESET_DELIVERY_WEBHOOK_URL = 'http://127.0.0.1:9999/recovery'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)

    await deliverPasswordRecoveryLink({
      recipient: 'synthetic@example.invalid',
      resetUrl: 'http://127.0.0.1:3000/restablecer-password?token=synthetic',
      expiresAt: new Date('2026-09-11T00:00:00Z'),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
    })
  })
})
