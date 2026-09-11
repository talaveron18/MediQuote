import { describe, expect, it } from 'vitest'
import {
  appendLaborInputVersion,
  parseVerifiedLaborInputStore,
  resolveVerifiedLaborInput,
  resolveVerifiedLaborInputForDates,
  validateLaborInputDraft,
  type LaborInputDraft,
} from './verified-labor-inputs'

const baseDraft = (overrides: Partial<LaborInputDraft> = {}): LaborInputDraft => ({
  conceptKey: 'productive_hour_gross',
  categoryId: 'cat-enf',
  territory: 'Madrid',
  contractType: 'indefinido',
  value: 23.45,
  unit: 'EUR/h_productiva',
  effectiveFrom: '2026-09-01',
  sourceDocument: 'GESTORIA-SYNTHETIC-001',
  sourceDate: '2026-09-01',
  status: 'verified',
  ...overrides,
})

describe('verified labor inputs', () => {
  it('rejects unknown concepts, negative values and unverifiable sources', () => {
    const issues = validateLaborInputDraft(baseDraft({
      conceptKey: 'invented_salary_rule',
      value: -1,
      sourceDocument: '',
    }))
    expect(issues.map((issue) => issue.field)).toEqual(expect.arrayContaining([
      'conceptKey', 'value', 'sourceDocument',
    ]))
  })

  it('rejects a semantically wrong unit even when the numeric value is valid', () => {
    const issues = validateLaborInputDraft(baseDraft({ unit: '%' }))
    expect(issues.some((issue) => issue.field === 'unit' && issue.kind === 'invalid')).toBe(true)
  })

  it('is append-only and idempotent for the same source/version identity', () => {
    const first = appendLaborInputVersion({
      current: [], draft: baseDraft(), actorId: 'admin-1', now: new Date('2026-09-11T12:00:00Z'),
    })
    expect(first.status).toBe('ok')
    if (first.status !== 'ok') return
    const second = appendLaborInputVersion({
      current: first.records, draft: baseDraft(), actorId: 'admin-1', now: new Date('2026-09-11T12:01:00Z'),
    })
    expect(second.status).toBe('ok')
    if (second.status !== 'ok') return
    expect(second.duplicate).toBe(true)
    expect(second.records).toHaveLength(1)
    expect(second.records[0].recordedAt).toBe('2026-09-11T12:00:00.000Z')
  })

  it('resolves only an exact verified scope valid for the service date', () => {
    const drafts = [
      baseDraft({ id: 'madrid-enf', status: 'verified' }),
      baseDraft({ id: 'valladolid-enf', territory: 'Valladolid', value: 99, status: 'verified' }),
      baseDraft({ id: 'madrid-med', categoryId: 'cat-med', value: 88, status: 'verified' }),
      baseDraft({ id: 'madrid-enf-pending', effectiveFrom: '2027-01-01', value: 77, status: 'pending' }),
    ]
    const records = drafts.reduce((current, draft) => {
      const appended = appendLaborInputVersion({ current, draft, actorId: 'admin-1' })
      if (appended.status !== 'ok') throw new Error('fixture inválido')
      return appended.records
    }, [] as ReturnType<typeof parseVerifiedLaborInputStore>)

    const result = resolveVerifiedLaborInput({
      records,
      conceptKey: 'productive_hour_gross',
      categoryId: 'cat-enf',
      territory: 'madrid',
      contractType: 'indefinido',
      serviceDate: '2026-10-01',
    })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.value).toBe(23.45)
    expect(result.record.id).toBe('madrid-enf')
    expect(result.source.status).toBe('verified')
    expect(result.source.id).toBe('gestoria:madrid-enf')
  })

  it('fails closed when verified versions overlap instead of guessing precedence', () => {
    const first = appendLaborInputVersion({ current: [], draft: baseDraft({ id: 'v1' }), actorId: 'a' })
    if (first.status !== 'ok') throw new Error('fixture inválido')
    const second = appendLaborInputVersion({
      current: first.records,
      draft: baseDraft({ id: 'v2', effectiveFrom: '2026-09-15', sourceDocument: 'GESTORIA-SYNTHETIC-002' }),
      actorId: 'a',
    })
    if (second.status !== 'ok') throw new Error('fixture inválido')

    const result = resolveVerifiedLaborInput({
      records: second.records,
      conceptKey: 'productive_hour_gross',
      categoryId: 'cat-enf',
      territory: 'Madrid',
      contractType: 'indefinido',
      serviceDate: '2026-10-01',
    })
    expect(result.status).toBe('pending_configuration')
    if (result.status === 'pending_configuration') {
      expect(result.issues[0].kind).toBe('blocked')
      expect(result.issues[0].message).toContain('solapadas')
    }
  })

  it('fails closed when a single block crosses two verified versions', () => {
    const v1 = appendLaborInputVersion({
      current: [],
      draft: baseDraft({ id: 'v1', effectiveTo: '2026-09-30' }),
      actorId: 'a',
    })
    if (v1.status !== 'ok') throw new Error('fixture inválido')
    const v2 = appendLaborInputVersion({
      current: v1.records,
      draft: baseDraft({ id: 'v2', effectiveFrom: '2026-10-01', sourceDocument: 'GESTORIA-SYNTHETIC-002' }),
      actorId: 'a',
    })
    if (v2.status !== 'ok') throw new Error('fixture inválido')
    const result = resolveVerifiedLaborInputForDates({
      records: v2.records,
      conceptKey: 'productive_hour_gross',
      categoryId: 'cat-enf',
      territory: 'Madrid',
      contractType: 'indefinido',
      serviceDates: ['2026-09-30', '2026-10-01'],
    })
    expect(result.status).toBe('pending_configuration')
    if (result.status === 'pending_configuration') {
      expect(result.issues[0].kind).toBe('blocked')
      expect(result.issues[0].message).toContain('cruza versiones')
    }
  })

  it('fails closed when the only matching record is pending or expired', () => {
    const pending = appendLaborInputVersion({
      current: [],
      draft: baseDraft({ id: 'pending', status: 'pending', effectiveTo: '2026-09-30' }),
      actorId: 'a',
    })
    if (pending.status !== 'ok') throw new Error('fixture inválido')
    const result = resolveVerifiedLaborInput({
      records: pending.records,
      conceptKey: 'productive_hour_gross',
      categoryId: 'cat-enf',
      territory: 'Madrid',
      contractType: 'indefinido',
      serviceDate: '2026-10-01',
    })
    expect(result.status).toBe('pending_configuration')
  })
})
