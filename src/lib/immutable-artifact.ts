import { createHash } from 'node:crypto'

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson }

export type SourceDocumentFingerprint = {
  name: string
  mediaType?: string | null
  sizeBytes?: number | null
  sha256: string
}

export type ImmutableArtifactInput = {
  kind: 'budget' | 'cost_audit'
  entityId: string
  version: number
  createdAt: string
  createdById: string
  payload: unknown
  previousArtifactHash?: string | null
  sourceDocuments?: SourceDocumentFingerprint[]
}

export type ImmutableArtifact = {
  kind: 'budget' | 'cost_audit'
  entityId: string
  version: number
  createdAt: string
  createdById: string
  previousArtifactHash: string | null
  payloadCanonical: string
  payloadHash: string
  sourceDocuments: SourceDocumentFingerprint[]
  artifactHash: string
}

function canonicalValue(value: unknown, path = '$'): CanonicalJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Valor numérico no finito en ${path}`)
    return Object.is(value, -0) ? 0 : value
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError(`Fecha inválida en ${path}`)
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalValue(item, `${path}[${index}]`))
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Objeto no serializable canónicamente en ${path}`)
    }

    const result: Record<string, CanonicalJson> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key]
      if (child === undefined) throw new TypeError(`Valor undefined en ${path}.${key}`)
      result[key] = canonicalValue(child, `${path}.${key}`)
    }
    return result
  }

  throw new TypeError(`Tipo no serializable canónicamente en ${path}`)
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

export function fingerprintDocument(
  bytes: Uint8Array,
  metadata: Omit<SourceDocumentFingerprint, 'sha256' | 'sizeBytes'> & { sizeBytes?: number | null },
): SourceDocumentFingerprint {
  return {
    name: metadata.name,
    mediaType: metadata.mediaType ?? null,
    sizeBytes: metadata.sizeBytes ?? bytes.byteLength,
    sha256: sha256Hex(bytes),
  }
}

function assertSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new TypeError(`${field} debe ser un SHA-256 hexadecimal`)
}

export function buildImmutableArtifact(input: ImmutableArtifactInput): ImmutableArtifact {
  if (!input.entityId.trim()) throw new TypeError('entityId es obligatorio')
  if (!input.createdById.trim()) throw new TypeError('createdById es obligatorio')
  if (!Number.isInteger(input.version) || input.version < 1) throw new TypeError('version debe ser un entero >= 1')
  if (Number.isNaN(Date.parse(input.createdAt))) throw new TypeError('createdAt debe ser una fecha ISO válida')
  if (input.previousArtifactHash) assertSha256(input.previousArtifactHash, 'previousArtifactHash')

  const sourceDocuments = [...(input.sourceDocuments ?? [])].map((document) => {
    assertSha256(document.sha256, `sourceDocuments[${document.name}].sha256`)
    if (document.sizeBytes != null && (!Number.isInteger(document.sizeBytes) || document.sizeBytes < 0)) {
      throw new TypeError(`sizeBytes inválido para ${document.name}`)
    }
    return {
      name: document.name,
      mediaType: document.mediaType ?? null,
      sizeBytes: document.sizeBytes ?? null,
      sha256: document.sha256,
    }
  })

  const payloadCanonical = canonicalJson(input.payload)
  const payloadHash = sha256Hex(payloadCanonical)
  const envelope = {
    kind: input.kind,
    entityId: input.entityId,
    version: input.version,
    createdAt: new Date(input.createdAt).toISOString(),
    createdById: input.createdById,
    previousArtifactHash: input.previousArtifactHash ?? null,
    payloadHash,
    sourceDocuments,
  }
  const artifactHash = sha256Hex(canonicalJson(envelope))

  return {
    ...envelope,
    payloadCanonical,
    artifactHash,
  }
}

export function verifyImmutableArtifact(artifact: ImmutableArtifact): boolean {
  try {
    if (sha256Hex(artifact.payloadCanonical) !== artifact.payloadHash) return false
    const envelope = {
      kind: artifact.kind,
      entityId: artifact.entityId,
      version: artifact.version,
      createdAt: new Date(artifact.createdAt).toISOString(),
      createdById: artifact.createdById,
      previousArtifactHash: artifact.previousArtifactHash,
      payloadHash: artifact.payloadHash,
      sourceDocuments: artifact.sourceDocuments,
    }
    return sha256Hex(canonicalJson(envelope)) === artifact.artifactHash
  } catch {
    return false
  }
}
