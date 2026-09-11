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

  it('keeps password, recovery claim, reset invalidation, session revocation and audit in one serializable transaction', () => {
    expect(routeSource).toContain("{ isolationLevel: 'Serializable' }")
    expect(routeSource).toContain("startsWith: RESET_PREFIX")
    expect(routeSource).toContain('SESSION_PREFIX')
    expect(routeSource).toContain("action: 'maestro_password_recovered'")
  })

  it('does not log the thrown error or place account identifiers/secrets into the success audit payload', () => {
    expect(routeSource).toContain("console.error('[POST /api/recovery/maestro] Error interno de recuperación')")
    expect(routeSource).not.toContain("console.error('[POST /api/recovery/maestro] Error interno de recuperación', error)")
    expect(routeSource).not.toContain('summary: `')
    expect(routeSource).not.toContain('entityId: maestro.email')
    expect(routeSource).not.toContain('userId: maestro.id')
  })
})
