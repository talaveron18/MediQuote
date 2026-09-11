import { describe, expect, it } from 'vitest'
import {
  appendLaborInputVersion,
  resolveVerifiedLaborInput,
  type LaborInputDraft,
  type VerifiedLaborInputRecord,
} from './verified-labor-inputs'

const draft = (overrides: Partial<LaborInputDraft> = {}): LaborInputDraft => ({
  id: 'v1',
  conceptKey: 'productive_hour_gross',
  categoryId: 'cat-enf',
  territory: 'Madrid',
  contractType: 'indefinido',
  value: 23,
  unit: 'EUR/h_productiva',
  effectiveFrom: '2026-01-01',
  effectiveTo: '2026-12-31',
  sourceDocument: 'GESTORIA-SYNTHETIC-V1',
  sourceDate: '2026-01-02',
  status: 'verified',
  ...overrides,
})

function append(current: VerifiedLaborInputRecord[], value: LaborInputDraft) {
  return appendLaborInputVersion({ current, draft: value, actorId: 'admin-e2e', now: new Date('2026-09-11T20:00:00Z') })
}

function resolve(records: VerifiedLaborInputRecord[]) {
  return resolveVerifiedLaborInput({
    records,
    conceptKey: 'productive_hour_gross',
    categoryId: 'cat-enf',
    territory: 'Madrid',
    contractType: 'indefinido',
    serviceDate: '2026-10-01',
  })
}

describe('verified labor append-only supersession', () => {
  it('keeps the original record immutable while a pending successor removes it from new calculations', () => {
    const first = append([], draft())
    if (first.status !== 'ok') throw new Error('fixture inválido')
    const pending = append(first.records, draft({
      id: 'v1-invalidated',
      sourceDocument: 'GESTORIA-SYNTHETIC-INVALIDATION',
      sourceDate: '2026-09-11',
      status: 'pending',
      supersedesId: 'v1',
    }))
    expect(pending.status).toBe('ok')
    if (pending.status !== 'ok') return
    expect(pending.records).toHaveLength(2)
    expect(pending.records[0].status).toBe('verified')
    expect(pending.records[0].supersedesId).toBeUndefined()
    expect(resolve(pending.records).status).toBe('pending_configuration')
  })

  it('allows a verified replacement to supersede v1 without overlap ambiguity', () => {
    const first = append([], draft())
    if (first.status !== 'ok') throw new Error('fixture inválido')
    const replacement = append(first.records, draft({
      id: 'v2', value: 29, sourceDocument: 'GESTORIA-SYNTHETIC-V2', sourceDate: '2026-09-11',
      status: 'verified', supersedesId: 'v1',
    }))
    expect(replacement.status).toBe('ok')
    if (replacement.status !== 'ok') return
    const result = resolve(replacement.records)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.value).toBe(29)
      expect(result.record.id).toBe('v2')
    }
  })

  it('rejects supersession across a different professional scope', () => {
    const first = append([], draft())
    if (first.status !== 'ok') throw new Error('fixture inválido')
    const crossScope = append(first.records, draft({
      id: 'bad', categoryId: 'cat-med', sourceDocument: 'GESTORIA-SYNTHETIC-BAD', sourceDate: '2026-09-11',
      status: 'pending', supersedesId: 'v1',
    }))
    expect(crossScope.status).toBe('invalid')
    if (crossScope.status === 'invalid') expect(crossScope.issues[0].kind).toBe('blocked')
    expect(resolve(first.records).status).toBe('ready')
  })

  it('rejects branching a second successor from the same immutable version', () => {
    const first = append([], draft())
    if (first.status !== 'ok') throw new Error('fixture inválido')
    const second = append(first.records, draft({
      id: 'v2', sourceDocument: 'GESTORIA-SYNTHETIC-V2', sourceDate: '2026-09-10',
      status: 'pending', supersedesId: 'v1',
    }))
    if (second.status !== 'ok') throw new Error('fixture inválido')
    const branch = append(second.records, draft({
      id: 'v3', sourceDocument: 'GESTORIA-SYNTHETIC-V3', sourceDate: '2026-09-11',
      status: 'verified', supersedesId: 'v1',
    }))
    expect(branch.status).toBe('conflict')
    if (branch.status === 'conflict') expect(branch.issues[0].message).toContain('segunda rama')
  })
})
