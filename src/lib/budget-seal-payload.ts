import { buildBudgetSealPayload } from './sealed-economic-records'

export type PersistedBudgetForSeal = {
  id: string
  code: string
  status: string
  validUntil: string | null
  description: string | null
  clientNotes: string | null
  internalNotes?: string | null
  subtotal: number
  totalSurcharges: number
  discountPercent: number
  discountAmount: number
  ivaPercent: number
  ivaAmount: number
  totalFinal: number
  serviceLocationId: string
  serviceAutonomousCommunity: string
  serviceProvince: string
  serviceMunicipality: string | null
  client: unknown
  serviceBlocks: unknown[]
}

export function buildPersistedBudgetSealPayload(input: {
  budget: PersistedBudgetForSeal
  quoteSnapshot: string
  version: number
  emittedAt?: Date
}) {
  const economicSnapshot = JSON.parse(input.quoteSnapshot) as Record<string, any>
  const budget = input.budget
  return buildBudgetSealPayload({
    budgetId: budget.id,
    code: budget.code,
    version: input.version,
    emittedAt: (input.emittedAt ?? new Date()).toISOString(),
    client: budget.client,
    service: {
      status: budget.status,
      validUntil: budget.validUntil,
      description: budget.description,
      clientNotes: budget.clientNotes,
      internalNotes: budget.internalNotes ?? null,
      location: {
        id: budget.serviceLocationId,
        autonomousCommunity: budget.serviceAutonomousCommunity,
        province: budget.serviceProvince,
        municipality: budget.serviceMunicipality,
      },
    },
    serviceBlocks: budget.serviceBlocks,
    // El snapshot servidor completo es la fuente económica exacta utilizada.
    // No reconstruimos ni inventamos parámetros que no estén presentes en él.
    economicInputs: economicSnapshot,
    internalEconomicConfig: economicSnapshot.internalEconomicConfig ?? null,
    calculation: {
      subtotal: budget.subtotal,
      totalSurcharges: budget.totalSurcharges,
      discountPercent: budget.discountPercent,
      discountAmount: budget.discountAmount,
      ivaPercent: budget.ivaPercent,
      ivaAmount: budget.ivaAmount,
      totalFinal: budget.totalFinal,
    },
    engineVersion: typeof economicSnapshot.engineVersion === 'string'
      ? economicSnapshot.engineVersion
      : null,
  })
}
