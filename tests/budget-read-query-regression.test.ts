import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/budgets/route.ts'), 'utf8')
const getRoute = source.slice(source.indexOf('export async function GET'), source.indexOf('export async function POST'))

test('commercial budget reads remain scoped to the authenticated creator', () => {
  assert.match(getRoute, /if \(!canAccessAllBudgets\(auth\.role\)\) where\.createdById = auth\.id/)
})

test('commercial budget reads continue stripping internal economic fields', () => {
  assert.match(source, /function sanitizeBudgetForCommercial/)
  assert.match(source, /internalNotes, serviceBlocks/)
  assert.match(source, /internalCostPerHour, internalMargin, pricePerHour, fixedPrice/)
  assert.match(getRoute, /sanitizeBudgetsForRole/)
})

test('budget reopen preserves ordered service blocks and deserializes calendar arrays', () => {
  assert.match(getRoute, /serviceBlocks: \{ orderBy: \{ sortOrder: 'asc' \} \}/)
  assert.match(source, /specificDates: parseJsonArray<string>/)
  assert.match(source, /daysOfWeek: parseJsonArray<number>/)
  assert.match(source, /holidayTypesExcluded: parseJsonArray<string>/)
  assert.match(source, /enabledSurcharges: parseJsonArray<string>/)
})

test('single-budget reads fail closed when the scoped id is not visible', () => {
  assert.match(getRoute, /if \(id && budgets\.length === 0\)/)
  assert.match(getRoute, /Presupuesto no encontrado/)
  assert.match(getRoute, /status: 404/)
})
