import { describe, expect, it } from 'vitest'
import { sha256Hex } from './immutable-artifact'
import { buildBudgetSealPayload, buildCostAuditSealPayload } from './sealed-economic-records'

describe('sealed economic records', () => {
  it('desacopla la fotografía del presupuesto de cambios posteriores de configuración', () => {
    const internalConfig = { commission: 0.1, overhead: 25 }
    const sealed = buildBudgetSealPayload({
      budgetId: 'b1', code: 'PRES-1', version: 1,
      emittedAt: '2026-09-10T03:00:00.000Z',
      client: { id: 'c1', name: 'Cliente sintético' },
      service: { province: 'Madrid' },
      serviceBlocks: [{ id: 'block-1', sortOrder: 0, hours: 8 }],
      economicInputs: { labor: 100 },
      internalEconomicConfig: internalConfig,
      calculation: { total: 200 },
      engineVersion: 'test',
    })

    internalConfig.overhead = 999
    expect((sealed as any).internalEconomicConfig.overhead).toBe(25)
  })

  it('mantiene costes internos GASI fuera de las líneas comparadas con gestoría', () => {
    const payload = buildCostAuditSealPayload({
      auditId: 'a1', budgetId: 'b1', budgetVersion: 1, auditVersion: 1,
      closedAt: '2026-09-10T05:00:00.000Z',
      originalEconomicSnapshotHash: sha256Hex('budget-v1'),
      gestoriaDocument: { name: 'gestoria.pdf', mediaType: 'application/pdf', sizeBytes: 3, sha256: sha256Hex('pdf') },
      gestoriaValues: { salario: 100, seguridadSocial: 30 },
      comparison: [
        { key: 'salary', label: 'Salario', mediquoteValue: 100, gestoriaValue: 100, difference: 0, status: 'match' },
        { key: 'ss', label: 'Seguridad Social', mediquoteValue: 25, gestoriaValue: 30, difference: 5, status: 'mismatch' },
      ],
      internalGasiCosts: [
        { key: 'commission', label: 'Comisión comercial', amount: 20, ruleReference: 'config-v1' },
        { key: 'overhead', label: 'Overhead', amount: 10, ruleReference: 'config-v1' },
      ],
      reconciliationResult: { contrastableDifference: 5, economicTotalWithInternal: 160 },
    }) as any

    expect(payload.comparison).toHaveLength(2)
    expect(payload.internalGasiCosts).toHaveLength(2)
    expect(payload.comparison.some((line: any) => line.key === 'commission')).toBe(false)
    expect(payload.comparison.some((line: any) => line.key === 'overhead')).toBe(false)
  })

  it('permite marcar un concepto no aportado por gestoría sin inventar un valor', () => {
    const payload = buildCostAuditSealPayload({
      auditId: 'a1', budgetId: 'b1', budgetVersion: 1, auditVersion: 1,
      closedAt: '2026-09-10T05:00:00.000Z',
      originalEconomicSnapshotHash: sha256Hex('budget-v1'),
      gestoriaDocument: { name: 'gestoria.pdf', sha256: sha256Hex('pdf') },
      gestoriaValues: {},
      comparison: [
        { key: 'plus', label: 'Plus', mediquoteValue: 10, gestoriaValue: null, difference: null, status: 'not_provided' },
      ],
      internalGasiCosts: [], reconciliationResult: {},
    }) as any
    expect(payload.comparison[0].status).toBe('not_provided')
  })

  it('rechaza una falsa conciliación sin ambos valores', () => {
    expect(() => buildCostAuditSealPayload({
      auditId: 'a1', budgetId: 'b1', budgetVersion: 1, auditVersion: 1,
      closedAt: '2026-09-10T05:00:00.000Z',
      originalEconomicSnapshotHash: sha256Hex('budget-v1'),
      gestoriaDocument: { name: 'gestoria.pdf', sha256: sha256Hex('pdf') },
      gestoriaValues: {},
      comparison: [
        { key: 'salary', label: 'Salario', mediquoteValue: 100, gestoriaValue: null, difference: null, status: 'match' },
      ],
      internalGasiCosts: [], reconciliationResult: {},
    })).toThrow(/requiere ambos valores/)
  })
})
