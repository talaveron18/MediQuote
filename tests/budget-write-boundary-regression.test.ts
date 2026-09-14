import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/budgets/route.ts'), 'utf8')
const post = source.slice(source.indexOf('export async function POST'), source.indexOf('export async function PUT'))
const put = source.slice(source.indexOf('export async function PUT'), source.indexOf('export async function DELETE'))
const del = source.slice(source.indexOf('export async function DELETE'))

test('POST rejects malformed JSON before costing quote lookup', () => {
  const malformedJsonGuard = post.indexOf("if (!body) return badBudgetRequest('El cuerpo JSON del presupuesto no es válido')")
  const costingQuoteLookup = post.indexOf('getValidCostingQuote(auth.id, calculationToken)')

  assert.notEqual(malformedJsonGuard, -1)
  assert.notEqual(costingQuoteLookup, -1)
  assert.ok(malformedJsonGuard < costingQuoteLookup)
})

test('POST only permits borrador as initial status', () => {
  assert.match(source, /function hasInvalidInitialBudgetStatus\(status: unknown\): boolean/)
  assert.match(source, /return status !== undefined && status !== 'borrador'/)
  assert.match(source, /Los presupuestos nuevos solo pueden crearse en estado borrador/)
})

test('PUT hides inaccessible budgets behind 404 before mutation', () => {
  const accessGuard = put.indexOf('if (!existing || !canAccessBudget(auth, existing))')
  const transactionStart = put.indexOf('const result = await db.$transaction')

  assert.notEqual(accessGuard, -1)
  assert.notEqual(transactionStart, -1)
  assert.match(put, /return NextResponse\.json\(\{ error: 'Presupuesto no encontrado' \}, \{ status: 404 \}\)/)
  assert.ok(accessGuard < transactionStart)
})

test('DELETE closes budgets transactionally and never hard-deletes them', () => {
  assert.match(del, /status: 'caducado'/)
  assert.match(del, /action: 'status_changed'/)
  assert.match(del, /return sealPersistedBudget\(tx, id, auth\.id, quoteSnapshot, sealedAt\)/)
  assert.doesNotMatch(del, /tx\.budget\.delete\(/)
  assert.doesNotMatch(del, /db\.budget\.delete\(/)
})
