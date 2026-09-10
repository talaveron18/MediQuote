import { describe, expect, it } from 'vitest'
import { buildImmutableArtifact } from './immutable-artifact'
import { verifyEconomicArtifactChain } from './economic-artifact-chain'

function buildChain() {
  const v1 = buildImmutableArtifact({
    kind: 'budget',
    entityId: 'budget-1',
    version: 1,
    createdAt: '2026-09-10T03:00:00Z',
    createdById: 'user-1',
    payload: { total: 100 },
  })
  const v2 = buildImmutableArtifact({
    kind: 'budget',
    entityId: 'budget-1',
    version: 2,
    createdAt: '2026-09-10T03:01:00Z',
    createdById: 'user-1',
    previousArtifactHash: v1.artifactHash,
    payload: { total: 105 },
  })
  return [v1, v2]
}

describe('verifyEconomicArtifactChain', () => {
  it('acepta una cadena íntegra y consecutiva', () => {
    expect(verifyEconomicArtifactChain(buildChain())).toEqual({
      valid: true,
      error: null,
      verifiedVersions: 2,
    })
  })

  it('detecta una fotografía manipulada', () => {
    const chain = buildChain()
    chain[1] = { ...chain[1], payloadCanonical: '{"total":999}' }
    expect(verifyEconomicArtifactChain(chain)).toMatchObject({ valid: false, verifiedVersions: 1 })
  })

  it('detecta huecos o reordenación de versiones', () => {
    const [v1, v2] = buildChain()
    expect(verifyEconomicArtifactChain([v2, v1])).toMatchObject({ valid: false, verifiedVersions: 0 })
  })

  it('detecta un enlace a una fotografía anterior incorrecta', () => {
    const chain = buildChain()
    const badV2 = buildImmutableArtifact({
      kind: 'budget',
      entityId: 'budget-1',
      version: 2,
      createdAt: '2026-09-10T03:01:00Z',
      createdById: 'user-1',
      previousArtifactHash: '0'.repeat(64),
      payload: { total: 105 },
    })
    expect(verifyEconomicArtifactChain([chain[0], badV2])).toMatchObject({ valid: false, verifiedVersions: 1 })
  })
})
