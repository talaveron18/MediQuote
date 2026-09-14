import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const source = readFileSync(resolve(root, 'src/app/api/budgets/route.ts'), 'utf8')

function bodyOf(fnName: 'GET' | 'PUT') {
  const start = source.indexOf(`export async function ${fnName}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = source.indexOf('\nexport async function ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

describe('budget read and reopen integrity regression', () => {
  it('keeps commercial budget reads scoped to the authenticated creator', () => {
    const get = bodyOf('GET')
    expect(source).toContain("function canAccessAllBudgets(role: string): boolean")
    expect(source).toContain("return role === 'admin' || role === 'maestro'")
    expect(get).toContain("if (!canAccessAllBudgets(auth.role)) where.createdById = auth.id")
  })

  it('keeps internal economic fields out of commercial reopen payloads', () => {
    const sanitizerStart = source.indexOf('function sanitizeBudgetForCommercial')
    const sanitizerEnd = source.indexOf('\nfunction sanitizeBudgetsForRole', sanitizerStart)
    const sanitizer = source.slice(sanitizerStart, sanitizerEnd)
    expect(sanitizer).toContain('internalNotes')
    expect(sanitizer).toContain('internalCostPerHour')
    expect(sanitizer).toContain('internalMargin')
    expect(sanitizer).toContain('pricePerHour')
    expect(sanitizer).toContain('fixedPrice')
  })

  it('deserializes persisted scheduling arrays before a budget is reopened for editing', () => {
    expect(source).toContain('specificDates: parseJsonArray<string>(block.specificDates, [])')
    expect(source).toContain('daysOfWeek: parseJsonArray<number>(block.daysOfWeek, [1, 2, 3, 4, 5])')
    expect(source).toContain('holidayTypesExcluded: parseJsonArray<string>(block.holidayTypesExcluded, [])')
    expect(source).toContain('enabledSurcharges: parseJsonArray<string>(block.enabledSurcharges, [])')
    expect(bodyOf('GET')).toContain('budgets.map(deserializeBudget)')
  })

  it('keeps accepted, rejected and expired budgets immutable through ordinary PUT edits', () => {
    const lockStart = source.indexOf('async function lockMutableBudget')
    const lockEnd = source.indexOf('\nasync function sealPersistedBudget', lockStart)
    const lock = source.slice(lockStart, lockEnd)
    expect(lock).toContain("rows[0].status === 'aceptado'")
    expect(lock).toContain("rows[0].status === 'rechazado'")
    expect(lock).toContain("rows[0].status === 'caducado'")
    expect(bodyOf('PUT')).toContain('await lockMutableBudget(tx, id)')
  })
})
