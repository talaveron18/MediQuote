import { describe, expect, it } from 'vitest'
import {
  parsePasswordRecoveryConfirmBody,
  parsePasswordRecoveryRequestBody,
  trustedRecoverySourceIp,
} from './password-recovery-request-contract'

describe('password recovery request contracts', () => {
  it('accepts only the exact recovery request shape', () => {
    expect(parsePasswordRecoveryRequestBody({ email: 'user@example.invalid' })).toEqual({ email: 'user@example.invalid' })
    for (const value of [
      null,
      [],
      'user@example.invalid',
      {},
      { email: 123 },
      { email: 'user@example.invalid', role: 'admin' },
    ]) expect(parsePasswordRecoveryRequestBody(value)).toBeNull()
  })

  it('accepts only the exact recovery confirmation shape', () => {
    expect(parsePasswordRecoveryConfirmBody({ token: 'x', password: 'y' })).toEqual({ token: 'x', password: 'y' })
    for (const value of [
      null,
      [],
      {},
      { token: 'x' },
      { token: 1, password: 'y' },
      { token: 'x', password: 'y', userId: 'override' },
    ]) expect(parsePasswordRecoveryConfirmBody(value)).toBeNull()
  })
})

describe('trustedRecoverySourceIp', () => {
  it('uses only the Netlify-provided connection IP in Netlify runtime', () => {
    const headers = new Headers({
      'x-nf-client-connection-ip': '203.0.113.10',
      'x-real-ip': '198.51.100.12',
      'x-forwarded-for': '198.51.100.13',
    })
    expect(trustedRecoverySourceIp(headers, true)).toBe('203.0.113.10')
  })

  it('does not let forwarding headers replace a missing Netlify connection IP in Netlify runtime', () => {
    const headers = new Headers({
      'x-real-ip': '198.51.100.12',
      'x-forwarded-for': '198.51.100.13',
    })
    expect(trustedRecoverySourceIp(headers, true)).toBe('unknown')
  })

  it('validates fallback addresses outside Netlify', () => {
    expect(trustedRecoverySourceIp(new Headers({ 'x-real-ip': 'not-an-ip', 'x-forwarded-for': '203.0.113.20, 10.0.0.1' }), false)).toBe('203.0.113.20')
    expect(trustedRecoverySourceIp(new Headers({ 'x-forwarded-for': 'spoofed' }), false)).toBe('unknown')
  })
})
