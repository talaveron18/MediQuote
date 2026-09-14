import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const source = readFileSync(resolve(root, 'src/app/api/budgets/route.ts'), 'utf8')

function bodyOf(fnName: 'POST' | 'PUT') {
  const start = source.indexOf(`export async function ${fnName}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = source.indexOf('\nexport async function ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

describe('budget approval atomicity regression', () => {
  it('creates automatic approval inside the same POST transaction as budget, quote and seal', () => {
    const post = bodyOf('POST')
    const transactionStart = post.indexOf('const result = await db.$transaction(async (tx) => {')
    const approvalCall = post.indexOf('await ensureBudgetApproval(tx, {')
    const transactionEnd = post.indexOf('\n    })', transactionStart)

    expect(transactionStart).toBeGreaterThanOrEqual(0)
    expect(approvalCall).toBeGreaterThan(transactionStart)
    expect(approvalCall).toBeLessThan(transactionEnd)
    expect(post.slice(transactionEnd)).not.toContain('await ensureBudgetApproval(')
  })

  it('synchronizes automatic approval inside the same PUT economic-edit transaction', () => {
    const put = bodyOf('PUT')
    const transactionStart = put.indexOf('const result = await db.$transaction(async (tx) => {')
    const approvalCall = put.indexOf('await ensureBudgetApproval(tx, {')
    const transactionEnd = put.indexOf('\n    })', transactionStart)

    expect(transactionStart).toBeGreaterThanOrEqual(0)
    expect(approvalCall).toBeGreaterThan(transactionStart)
    expect(approvalCall).toBeLessThan(transactionEnd)
    expect(put.slice(transactionEnd)).not.toContain('await ensureBudgetApproval(')
  })

  it('uses only the transaction client for approval, maestro lookup and notifications', () => {
    const helperStart = source.indexOf('async function ensureBudgetApproval(tx: any, params: {')
    const helperEnd = source.indexOf('\n}\n\nfunction sanitizeBudgetForCommercial', helperStart)
    const helper = source.slice(helperStart, helperEnd)

    expect(helperStart).toBeGreaterThanOrEqual(0)
    expect(helper).toContain('tx.budgetApproval.findFirst')
    expect(helper).toContain('tx.budgetApproval.create')
    expect(helper).toContain('tx.user.findMany')
    expect(helper).toContain('tx.notification.createMany')
    expect(helper).not.toMatch(/\bdb\./)
  })

  it('keeps approval notification failure rollback-capable by awaiting it before transaction return', () => {
    const post = bodyOf('POST')
    const put = bodyOf('PUT')

    expect(post).toMatch(/await ensureBudgetApproval\(tx, \{[\s\S]*?\}\)\n\s+return \{ budget, artifact \}/)
    expect(put).toMatch(/await ensureBudgetApproval\(tx, \{[\s\S]*?\}\)\n\s+\}\n\s+return \{ updated, artifact \}/)
  })
})
