import { isIP } from 'node:net'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index])
}

export function parsePasswordRecoveryRequestBody(value: unknown): { email: string } | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ['email']) || typeof value.email !== 'string') return null
  return { email: value.email }
}

export function parsePasswordRecoveryConfirmBody(value: unknown): { token: string; password: string } | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ['password', 'token'])) return null
  if (typeof value.token !== 'string' || typeof value.password !== 'string') return null
  return { token: value.token, password: value.password }
}

function normalizedIp(value: string | null | undefined) {
  const candidate = value?.trim() ?? ''
  return isIP(candidate) ? candidate : ''
}

/**
 * Netlify documents X-Nf-Client-Connection-Ip as the platform-provided client
 * address. In a Netlify runtime we therefore fail closed to that header rather
 * than trusting caller-controlled forwarding headers. Local/non-Netlify
 * environments retain conservative proxy fallbacks for development and E2E.
 */
export function trustedRecoverySourceIp(headers: Headers, isNetlifyRuntime = process.env.NETLIFY === 'true'): string {
  const netlifyIp = normalizedIp(headers.get('x-nf-client-connection-ip'))
  if (isNetlifyRuntime) return netlifyIp || 'unknown'
  if (netlifyIp) return netlifyIp

  const realIp = normalizedIp(headers.get('x-real-ip'))
  if (realIp) return realIp

  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]
  return normalizedIp(forwarded) || 'unknown'
}
