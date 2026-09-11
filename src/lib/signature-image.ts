const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_IHDR = Buffer.from('IHDR', 'ascii')
const PNG_IEND = Buffer.from('IEND', 'ascii')
const MAX_SIGNATURE_DATA_URL_LENGTH = 700_000
const MAX_SIGNATURE_DIMENSION = 4096

export function isValidSignaturePngDataUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!value.startsWith(PNG_DATA_URL_PREFIX)) return false
  if (value.length > MAX_SIGNATURE_DATA_URL_LENGTH) return false

  const encoded = value.slice(PNG_DATA_URL_PREFIX.length)
  if (!encoded || encoded.length % 4 !== 0) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false

  let bytes: Buffer
  try {
    bytes = Buffer.from(encoded, 'base64')
  } catch {
    return false
  }

  // A PNG signature alone is not an image. Require the mandatory IHDR chunk,
  // sane non-zero dimensions, and the terminal IEND chunk before accepting a
  // client-controlled signature payload for persistence/rendering.
  if (bytes.length < 45) return false
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return false
  if (bytes.readUInt32BE(8) !== 13) return false
  if (!bytes.subarray(12, 16).equals(PNG_IHDR)) return false

  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width < 1 || height < 1 || width > MAX_SIGNATURE_DIMENSION || height > MAX_SIGNATURE_DIMENSION) return false

  const finalChunkLengthOffset = bytes.length - 12
  if (bytes.readUInt32BE(finalChunkLengthOffset) !== 0) return false
  if (!bytes.subarray(bytes.length - 8, bytes.length - 4).equals(PNG_IEND)) return false

  return true
}
