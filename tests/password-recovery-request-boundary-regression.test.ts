import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/app/api/recovery/password/request/route.ts'), 'utf8')

describe('password recovery request boundary regression coverage', () => {
  it('rejects query-string selectors before rate-limit and recovery issuance work', () => {
    const guard = source.indexOf('if (hasUnexpectedQuery(request))')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(source.indexOf('recordPasswordRecoveryAttempt'))
    expect(guard).toBeLessThan(source.indexOf('createStoredPasswordRecovery(email)'))
  })

  it('keeps malformed and query-bearing requests enumeration-safe', () => {
    expect(source).toContain("return genericResponse()")
    expect(source).toContain("status: 202")
    expect(source).toContain("Si existe una cuenta activa con ese correo")
  })

  it('does not persist raw SMTP exception text in audit evidence', () => {
    expect(source).not.toContain('deliveryError instanceof Error')
    expect(source).toContain("errorMessage: 'Error de entrega SMTP'")
  })

  it('marks recovery responses non-cacheable and prevents referrer leakage', () => {
    expect(source).toContain("'Cache-Control': 'no-store, max-age=0'")
    expect(source).toContain("Pragma: 'no-cache'")
    expect(source).toContain("'Referrer-Policy': 'no-referrer'")
  })
})
