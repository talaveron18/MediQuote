import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const middleware = readFileSync('src/middleware.ts', 'utf8')

describe('sensitive API cache coverage', () => {
  const protectedFamilies = [
    '/api/pdf/:path*',
    '/api/audit-logs/:path*',
    '/api/messages/:path*',
    '/api/backup/:path*',
  ]

  it.each(protectedFamilies)('keeps %s behind the global private/no-store middleware', (route) => {
    expect(middleware).toContain(`'${route}'`)
  })

  it('keeps the middleware response non-cacheable and non-sniffable', () => {
    expect(middleware).toContain("response.headers.set('Cache-Control', 'private, no-store')")
    expect(middleware).toContain("response.headers.set('Pragma', 'no-cache')")
    expect(middleware).toContain("response.headers.set('Expires', '0')")
    expect(middleware).toContain("response.headers.set('X-Content-Type-Options', 'nosniff')")
  })
})
