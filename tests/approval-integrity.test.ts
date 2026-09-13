import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const source = readFileSync(resolve(root, 'src/app/api/approvals/route.ts'), 'utf8')

describe('budget approval integrity', () => {
  it('rejects ambiguous or unsupported GET filters', () => {
    expect(source).toContain("[...params.keys()].some((key) => key !== 'status')")
    expect(source).toContain("const statusValues = params.getAll('status')")
    expect(source).toContain('statusValues.length > 1')
    expect(source).toContain("new Set(['pending', 'approved', 'rejected'])")
  })

  it('keeps POST input on an explicit allowlist', () => {
    expect(source).toContain("hasOnlyKeys(body, ['budgetId', 'reason'])")
    expect(source).toContain("typeof body.budgetId !== 'string'")
    expect(source).toContain("typeof body.reason !== 'string'")
  })

  it('creates approval, notifications and history in one transaction', () => {
    const transaction = source.match(/const result = await db\.\$transaction\(async \(tx\) => \{([\s\S]*?)\n  \}\);/)
    expect(transaction).not.toBeNull()
    expect(transaction?.[1]).toContain('tx.budgetApproval.create')
    expect(transaction?.[1]).toContain('tx.notification.createMany')
    expect(transaction?.[1]).toContain('tx.budgetHistory.create')
    expect(source).not.toMatch(/await db\.notification\.createMany\(/)
    expect(source).not.toMatch(/await db\.budgetHistory\.create\(/)
  })

  it('claims a pending decision atomically before writing side effects', () => {
    expect(source).toContain("hasOnlyKeys(body, ['id', 'decision', 'comment'])")
    expect(source).toContain('tx.budgetApproval.updateMany')
    expect(source).toContain("where: { id, status: 'pending' }")
    expect(source).toContain('if (claimed.count !== 1) return null')
    expect(source).toContain("return privateNoStoreJson({ error: 'La solicitud ya no está pendiente' }, { status: 409 })")
  })
})
