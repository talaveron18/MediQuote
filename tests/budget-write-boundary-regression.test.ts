import fs from 'node:fs'
import path from 'node:path'

describe('budget write boundary regressions', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/budgets/route.ts'), 'utf8')

  test('POST rejects malformed JSON before costing quote lookup', () => {
    const post = source.slice(source.indexOf('export async function POST'), source.indexOf('export async function PUT'))
    expect(post.indexOf("if (!body) return badBudgetRequest('El cuerpo JSON del presupuesto no es válido')"))
      .toBeLessThan(post.indexOf('getValidCostingQuote(auth.id, calculationToken)'))
  })

  test('POST only permits borrador as initial status', () => {
    expect(source).toContain("function hasInvalidInitialBudgetStatus(status: unknown): boolean")
    expect(source).toContain("return status !== undefined && status !== 'borrador'")
    expect(source).toContain('Los presupuestos nuevos solo pueden crearse en estado borrador')
  })

  test('PUT hides inaccessible budgets behind 404 before mutation', () => {
    const put = source.slice(source.indexOf('export async function PUT'), source.indexOf('export async function DELETE'))
    expect(put).toContain('if (!existing || !canAccessBudget(auth, existing))')
    expect(put).toContain("return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 })")
    expect(put.indexOf('if (!existing || !canAccessBudget(auth, existing))'))
      .toBeLessThan(put.indexOf('const result = await db.$transaction'))
  })

  test('DELETE closes budgets transactionally and never hard-deletes them', () => {
    const del = source.slice(source.indexOf('export async function DELETE'))
    expect(del).toContain("status: 'caducado'")
    expect(del).toContain("action: 'status_changed'")
    expect(del).toContain('return sealPersistedBudget(tx, id, auth.id, quoteSnapshot, sealedAt)')
    expect(del).not.toContain('tx.budget.delete(')
    expect(del).not.toContain('db.budget.delete(')
  })
})
