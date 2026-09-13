export const MAXIMUM_SMTP_RESPONSE_BYTES = 64 * 1024

export type ParsedSmtpResponse = { code: number; text: string }

/**
 * Parses the SMTP status accumulated for one command. Multiline replies end
 * only when the status code is followed by a space. The byte ceiling prevents
 * a peer from growing recovery-process memory indefinitely while never
 * terminating a reply.
 */
export function parseSmtpResponseBuffer(buffer: string): ParsedSmtpResponse | null {
  if (Buffer.byteLength(buffer, 'utf8') > MAXIMUM_SMTP_RESPONSE_BYTES) {
    throw new Error('Respuesta SMTP excede el límite de seguridad')
  }

  const lines = buffer.split(/\r?\n/).filter(Boolean)
  const last = lines.at(-1)
  const match = last?.match(/^(\d{3})\s/)
  if (!match) return null
  return { code: Number(match[1]), text: lines.join('\n') }
}
