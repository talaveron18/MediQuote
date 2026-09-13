import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

describe('HTTP synthetic seed policy', () => {
  it('requires explicit non-production opt-in in addition to the production block', () => {
    expect(source).toContain("process.env.NODE_ENV === 'production'")
    expect(source).toContain("process.env.MEDIQUOTE_ALLOW_SYNTHETIC_SEED !== 'true'")
  })

  it('cannot create invented economic configuration or fake clients', () => {
    const forbiddenWrites = [
      'db.professionalCategory.create',
      'db.professionalCategory.upsert',
      'db.surchargeConfig.create',
      'db.surchargeConfig.upsert',
      'db.laborRule.create',
      'db.laborRule.upsert',
      'db.appConfig.create',
      'db.appConfig.upsert',
      'db.client.create',
      'db.client.upsert',
    ]

    for (const operation of forbiddenWrites) {
      expect(source).not.toContain(operation)
    }
  })

  it('uses private no-store responses for the seed boundary', () => {
    expect(source).toContain('privateNoStoreJson')
    expect(source).toContain('genericInternalErrorResponse')
  })
})
