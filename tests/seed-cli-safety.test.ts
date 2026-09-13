import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const seedSource = readFileSync(resolve(root, 'scripts/seed.ts'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

describe('CLI seed safety boundaries', () => {
  it('requires explicit non-production opt-in', () => {
    expect(seedSource).toContain("process.env.NODE_ENV === 'production'")
    expect(seedSource).toContain("process.env.MEDIQUOTE_ALLOW_SYNTHETIC_SEED !== 'true'")
  })

  it('does not seed economic, labor, surcharge, legal-parameter or client fixtures', () => {
    for (const forbidden of [
      'professionalCategory.create',
      'professionalCategory.upsert',
      'surchargeConfig.create',
      'surchargeConfig.upsert',
      'laborRule.create',
      'laborRule.update',
      'legalParameter.create',
      'legalParameter.upsert',
      'client.create',
      "key: 'ivaPercent'",
      "key: 'maxDiscountPercent'",
      "key: 'costing_overhead_percent'",
      "key: 'costing_management_fee_per_contract'",
    ]) {
      expect(seedSource).not.toContain(forbidden)
    }
  })

  it('never generates or logs temporary passwords', () => {
    expect(seedSource).not.toContain('generateTemporaryPassword')
    expect(seedSource).not.toMatch(/Temporary password/i)
    expect(seedSource).not.toMatch(/console\.log\([^\n]*configuredPassword/)
    expect(seedSource).not.toMatch(/console\.log\([^\n]*initialPassword/)
  })

  it('does not run the seed implicitly from setup', () => {
    expect(packageJson.scripts.setup).toBe('prisma generate && prisma db push')
    expect(packageJson.scripts.seed).toBe('tsx scripts/seed.ts')
  })
})
