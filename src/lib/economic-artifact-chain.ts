import { type ImmutableArtifact, verifyImmutableArtifact } from './immutable-artifact'

export type ArtifactChainVerification = {
  valid: boolean
  error: string | null
  verifiedVersions: number
}

/**
 * Verifies both the integrity of every artifact and the append-only link between
 * consecutive versions. Callers must provide one entity/kind ordered by version.
 */
export function verifyEconomicArtifactChain(artifacts: ImmutableArtifact[]): ArtifactChainVerification {
  if (artifacts.length === 0) {
    return { valid: true, error: null, verifiedVersions: 0 }
  }

  const kind = artifacts[0].kind
  const entityId = artifacts[0].entityId

  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index]
    const expectedVersion = index + 1

    if (artifact.kind !== kind || artifact.entityId !== entityId) {
      return {
        valid: false,
        error: `La versión ${artifact.version} pertenece a otra cadena`,
        verifiedVersions: index,
      }
    }
    if (artifact.version !== expectedVersion) {
      return {
        valid: false,
        error: `Secuencia de versiones rota: se esperaba v${expectedVersion} y se recibió v${artifact.version}`,
        verifiedVersions: index,
      }
    }
    if (!verifyImmutableArtifact(artifact)) {
      return {
        valid: false,
        error: `Integridad inválida en v${artifact.version}`,
        verifiedVersions: index,
      }
    }

    const expectedPreviousHash = index === 0 ? null : artifacts[index - 1].artifactHash
    if (artifact.previousArtifactHash !== expectedPreviousHash) {
      return {
        valid: false,
        error: `Enlace de cadena inválido en v${artifact.version}`,
        verifiedVersions: index,
      }
    }
  }

  return { valid: true, error: null, verifiedVersions: artifacts.length }
}
