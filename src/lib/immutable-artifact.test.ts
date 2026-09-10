import { describe, expect, it } from 'vitest'
import {
  buildImmutableArtifact,
  canonicalJson,
  fingerprintDocument,
  sha256Hex,
  verifyImmutableArtifact,
} from './immutable-artifact'

describe('immutable artifact', () => {
  it('canonicaliza objetos con independencia del orden de claves', () => {
    expect(canonicalJson({ b: 2, a: { z: 3, y: 4 } }))
      .toBe(canonicalJson({ a: { y: 4, z: 3 }, b: 2 }))
  })

  it('mantiene el orden de arrays como parte del contenido', () => {
    expect(sha256Hex(canonicalJson([1, 2, 3])))
      .not.toBe(sha256Hex(canonicalJson([3, 2, 1])))
  })

  it('genera un artefacto verificable y detecta alteración del payload', () => {
    const artifact = buildImmutableArtifact({
      kind: 'budget',
      entityId: 'budget-1',
      version: 1,
      createdAt: '2026-09-10T03:00:00.000Z',
      createdById: 'user-1',
      payload: { total: 123.45, config: { overhead: null } },
    })

    expect(verifyImmutableArtifact(artifact)).toBe(true)
    expect(verifyImmutableArtifact({ ...artifact, payloadCanonical: canonicalJson({ total: 999 }) })).toBe(false)
  })

  it('encadena versiones: cambiar versión o hash padre cambia el hash del artefacto', () => {
    const v1 = buildImmutableArtifact({
      kind: 'budget', entityId: 'budget-1', version: 1,
      createdAt: '2026-09-10T03:00:00.000Z', createdById: 'user-1', payload: { total: 100 },
    })
    const v2 = buildImmutableArtifact({
      kind: 'budget', entityId: 'budget-1', version: 2,
      createdAt: '2026-09-10T04:00:00.000Z', createdById: 'user-1', payload: { total: 100 },
      previousArtifactHash: v1.artifactHash,
    })

    expect(v2.previousArtifactHash).toBe(v1.artifactHash)
    expect(v2.artifactHash).not.toBe(v1.artifactHash)
    expect(verifyImmutableArtifact(v2)).toBe(true)
  })

  it('hashea los bytes exactos del documento fuente', () => {
    const a = fingerprintDocument(new Uint8Array([1, 2, 3]), { name: 'gestoria.pdf', mediaType: 'application/pdf' })
    const b = fingerprintDocument(new Uint8Array([1, 2, 4]), { name: 'gestoria.pdf', mediaType: 'application/pdf' })
    expect(a.sizeBytes).toBe(3)
    expect(a.sha256).not.toBe(b.sha256)
  })

  it('rechaza valores que JSON podría degradar silenciosamente', () => {
    expect(() => canonicalJson({ bad: Number.NaN })).toThrow(/no finito/)
    expect(() => canonicalJson({ missing: undefined })).toThrow(/undefined/)
  })
})
