export type PublicUrlInput = {
  path: string
  requestOrigin: string
  configuredOrigin?: string | null
  production?: boolean
}

/**
 * Builds externally shared MediQuote URLs without trusting the incoming Host
 * header in production. Sensitive links (password recovery, signatures) must
 * use the explicitly configured canonical public origin.
 */
export function buildTrustedPublicUrl(input: PublicUrlInput): URL {
  const production = input.production ?? process.env.NODE_ENV === 'production'
  const configured = input.configuredOrigin?.trim() ?? ''
  const base = configured || (production ? '' : input.requestOrigin)

  if (!base) {
    throw new Error('MEDIQUOTE_PUBLIC_ORIGIN no configurado')
  }

  let origin: URL
  try {
    origin = new URL(base)
  } catch {
    throw new Error('MEDIQUOTE_PUBLIC_ORIGIN no es una URL válida')
  }

  if (origin.username || origin.password) {
    throw new Error('MEDIQUOTE_PUBLIC_ORIGIN no puede incluir credenciales')
  }
  if (production && origin.protocol !== 'https:') {
    throw new Error('MEDIQUOTE_PUBLIC_ORIGIN debe usar HTTPS en producción')
  }
  if (!['http:', 'https:'].includes(origin.protocol)) {
    throw new Error('MEDIQUOTE_PUBLIC_ORIGIN debe usar HTTP o HTTPS')
  }

  // The configured value is an origin, not a path prefix. Discard any path,
  // query or fragment so callers cannot accidentally inherit unsafe content.
  origin.pathname = '/'
  origin.search = ''
  origin.hash = ''

  return new URL(input.path, origin)
}
