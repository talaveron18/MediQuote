import { describe, expect, it } from 'vitest'
import { buildPersistedBudgetSealPayload } from './budget-seal-payload'

const budget = {
  id: 'budget-1', code: 'PRES-1', status: 'borrador', validUntil: '2026-10-10',
  description: 'Cobertura', clientNotes: null, internalNotes: 'nota interna',
  subtotal: 100, totalSurcharges: 0, discountPercent: 0, discountAmount: 0,
  ivaPercent: 21, ivaAmount: 21, totalFinal: 121,
  serviceLocationId: 'loc-1', serviceAutonomousCommunity: 'Madrid',
  serviceProvince: 'Madrid', serviceMunicipality: 'Madrid',
  client: { id: 'client-1', businessName: 'Cliente', cif: 'B1' },
  serviceBlocks: [{ id: 'block-1', serviceName: 'Enfermería', totalHours: 8 }],
}

const quoteSnapshot = JSON.stringify({
  engineVersion: 'engine-test',
  internalEconomicConfig: { overhead: { source: 'configured', value: 0.25 } },
  serviceBlocks: [{ serviceName: 'Enfermería' }],
  schedules: [{ totalHours: 8 }],
  commercial: { clientDiscountPercentOfList: 0 },
})

describe('buildPersistedBudgetSealPayload', () => {
  it('congela versión, cálculo persistido y snapshot servidor completo', () => {
    const payload = buildPersistedBudgetSealPayload({
      budget,
      quoteSnapshot,
      version: 3,
      emittedAt: new Date('2026-09-10T07:30:00.000Z'),
    }) as any

    expect(payload.version).toBe(3)
    expect(payload.emittedAt).toBe('2026-09-10T07:30:00.000Z')
    expect(payload.calculation.totalFinal).toBe(121)
    expect(payload.economicInputs.engineVersion).toBe('engine-test')
    expect(payload.internalEconomicConfig).toEqual({ overhead: { source: 'configured', value: 0.25 } })
    expect(payload.serviceBlocks).toEqual(budget.serviceBlocks)
  })

  it('no inventa configuración interna ausente', () => {
    const payload = buildPersistedBudgetSealPayload({
      budget,
      quoteSnapshot: JSON.stringify({ serviceBlocks: [], schedules: [] }),
      version: 1,
    }) as any
    expect(payload.internalEconomicConfig).toBeNull()
  })
})
