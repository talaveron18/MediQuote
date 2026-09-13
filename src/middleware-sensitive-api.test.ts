import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { config, middleware } from './middleware'

const sensitiveMatchers = [
  '/api/signatures/:path*',
  '/api/recovery/:path*',
  '/api/clients/:path*',
  '/api/users/:path*',
] as const

describe('sensitive API cache defense', () => {
  it.each(sensitiveMatchers)('keeps %s under the private/no-store middleware', (matcher) => {
    expect(config.matcher).toContain(matcher)
  })

  it('emits the non-cacheable response contract used by sensitive APIs', () => {
    const response = middleware(new NextRequest('https://mediquote.invalid/api/signatures'))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(response.headers.get('expires')).toBe('0')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
