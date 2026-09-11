import { describe, expect, it } from 'vitest'
import { buildTrustedPublicUrl } from './public-origin'

describe('buildTrustedPublicUrl', () => {
  it('uses the configured canonical HTTPS origin in production', () => {
    const url = buildTrustedPublicUrl({
      path: '/firmar/token-seguro',
      requestOrigin: 'https://host-inyectado.invalid',
      configuredOrigin: 'https://mediquote.gasi.example/ruta?x=1#fragmento',
      production: true,
    })
    expect(url.toString()).toBe('https://mediquote.gasi.example/firmar/token-seguro')
  })

  it('fails closed in production when the canonical origin is missing', () => {
    expect(() => buildTrustedPublicUrl({
      path: '/restablecer-password',
      requestOrigin: 'https://host-inyectado.invalid',
      production: true,
    })).toThrow(/MEDIQUOTE_PUBLIC_ORIGIN no configurado/)
  })

  it('rejects insecure or credential-bearing production origins', () => {
    expect(() => buildTrustedPublicUrl({
      path: '/', requestOrigin: 'https://request.invalid', configuredOrigin: 'http://mediquote.example', production: true,
    })).toThrow(/HTTPS/)
    expect(() => buildTrustedPublicUrl({
      path: '/', requestOrigin: 'https://request.invalid', configuredOrigin: 'https://user:pass@mediquote.example', production: true,
    })).toThrow(/credenciales/)
  })

  it('allows the request origin only outside production for isolated development and tests', () => {
    const url = buildTrustedPublicUrl({
      path: '/firmar/test', requestOrigin: 'http://127.0.0.1:3000', production: false,
    })
    expect(url.toString()).toBe('http://127.0.0.1:3000/firmar/test')
  })

  it('rejects absolute and protocol-relative destinations that could escape the canonical origin', () => {
    for (const path of ['https://evil.example/reset', '//evil.example/reset', 'firmar/sin-barra']) {
      expect(() => buildTrustedPublicUrl({
        path,
        requestOrigin: 'https://request.invalid',
        configuredOrigin: 'https://mediquote.gasi.example',
        production: true,
      })).toThrow(/ruta pública/)
    }
  })
})
