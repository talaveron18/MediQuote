const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const MAX_SIGNATURE_DATA_URL_LENGTH = 700_000

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
  if (bytes.length < PNG_SIGNATURE.length) return false
  return bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
}
