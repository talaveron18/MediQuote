import { describe, expect, it } from 'vitest'
import { validatePasswordRecoveryDeliveryConfig } from './password-recovery-delivery'

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
})
