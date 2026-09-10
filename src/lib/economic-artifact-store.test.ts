import { beforeEach, describe, expect, it, vi } from 'vitest'

const budgetRows: Array<{ snapshot: string | null; createdAt: Date }> = []
const auditRows: Array<{ newData: string | null; createdAt: Date }> = []

vi.mock('./db', () => ({
  db: {
    budgetHistory: {
      findMany: vi.fn(async () => budgetRows.map(({ snapshot }) => ({ snapshot }))),
      findFirst: vi.fn(async () => budgetRows.length ? { snapshot: budgetRows.at(-1)!.snapshot } : null),
      create: vi.fn(async ({ data }: any) => {
        budgetRows.push({ snapshot: data.snapshot, createdAt: new Date() })
        return data
      }),
    },
    auditLog: {
      findMany: vi.fn(async () => auditRows.map(({ newData }) => ({ newData }))),
      create: vi.fn(async ({ data }: any) => {
        auditRows.push({ newData: data.newData, createdAt: new Date() })
        return data
      }),
    },
  },
}))

import { sealBudgetArtifact, sealCostAuditArtifact } from './economic-artifact-store'

describe('economic artifact store', () => {
  beforeEach(() => {
    budgetRows.length = 0
    auditRows.length = 0
  })

  it('encadena versiones de presupuesto sin sobrescribir la anterior', async () => {
    const first = await sealBudgetArtifact({ budgetId: 'b-1', createdById: 'u-1', payload: { total: 100 } })
    const second = await sealBudgetArtifact({ budgetId: 'b-1', createdById: 'u-1', payload: { total: 120 } })

    expect(first.version).toBe(1)
    expect(second.version).toBe(2)
    expect(second.previousArtifactHash).toBe(first.artifactHash)
    expect(budgetRows).toHaveLength(2)
    expect(JSON.parse(budgetRows[0].snapshot!).payloadCanonical).toBe('{"total":100}')
  })

  it('sella una auditoría con fingerprint documental y crea una nueva versión en la reauditación', async () => {
    const source = [{ name: 'gestoria.pdf', mediaType: 'application/pdf', sizeBytes: 10, sha256: 'a'.repeat(64) }]
    const first = await sealCostAuditArtifact({ auditId: 'a-1', createdById: 'u-1', sourceDocuments: source, payload: { status: 'ok' } })
    const second = await sealCostAuditArtifact({ auditId: 'a-1', createdById: 'u-1', sourceDocuments: source, payload: { status: 'reviewed' } })

    expect(first.sourceDocuments).toEqual(source)
    expect(second.version).toBe(2)
    expect(second.previousArtifactHash).toBe(first.artifactHash)
    expect(auditRows).toHaveLength(2)
  })
})
