import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

describe('maestro break-glass recovery boundary', () => {
  it('requires the dedicated recovery secret and never falls back to bootstrap credentials', () => {
    expect(routeSource).toContain('GASI_MAESTRO_RECOVERY_SECRET')
    expect(routeSource).not.toContain('GASI_BOOTSTRAP_TOKEN')
  })

  it('keeps every break-glass response private and non-cacheable', () => {
    expect(routeSource).toContain("import { privateNoStoreJson } from '@/lib/private-api-response'")
    expect(routeSource).not.toContain('NextResponse.json')
  })

  it('forces a password change after emergency recovery', () => {
    expect(routeSource).toContain('mustChangePassword: true')
  })
})
