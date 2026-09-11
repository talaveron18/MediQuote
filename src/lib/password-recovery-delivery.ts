export type PasswordRecoveryDeliveryInput = {
  recipient: string
  resetUrl: string
  expiresAt: Date
}

type DeliveryConfigInput = {
  webhookUrl?: string | null
  bearerToken?: string | null
  production?: boolean
}

export function validatePasswordRecoveryDeliveryConfig(input: DeliveryConfigInput) {
  const production = input.production ?? process.env.NODE_ENV === 'production'
  const webhookUrl = input.webhookUrl?.trim() ?? ''
  const bearerToken = input.bearerToken?.trim() ?? ''

  if (!webhookUrl) {
    throw new Error('PASSWORD_RESET_DELIVERY_WEBHOOK_URL no configurado')
  }

  let url: URL
  try {
    url = new URL(webhookUrl)
  } catch {
    throw new Error('PASSWORD_RESET_DELIVERY_WEBHOOK_URL no es una URL válida')
  }

  if (url.username || url.password) {
    throw new Error('El webhook de recuperación no puede incluir credenciales en la URL')
  }
  if (production && url.protocol !== 'https:') {
    throw new Error('El webhook de recuperación debe usar HTTPS en producción')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('El webhook de recuperación debe usar HTTP o HTTPS')
  }
  if (production && !bearerToken) {
    throw new Error('PASSWORD_RESET_DELIVERY_BEARER_TOKEN es obligatorio en producción')
  }

  return { url, bearerToken: bearerToken || null }
}

/**
 * Provider-neutral delivery adapter. Production requires an authenticated
 * HTTPS webhook owned by the selected transactional mail/SMTP integration.
 * No provider or credentials are hard-coded in MediQuote.
 */
export async function deliverPasswordRecoveryLink(input: PasswordRecoveryDeliveryInput): Promise<void> {
  const config = validatePasswordRecoveryDeliveryConfig({
    webhookUrl: process.env.PASSWORD_RESET_DELIVERY_WEBHOOK_URL,
    bearerToken: process.env.PASSWORD_RESET_DELIVERY_BEARER_TOKEN,
  })

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.bearerToken ? { authorization: `Bearer ${config.bearerToken}` } : {}),
    },
    body: JSON.stringify({
      type: 'password_recovery',
      recipient: input.recipient,
      resetUrl: input.resetUrl,
      expiresAt: input.expiresAt.toISOString(),
    }),
    cache: 'no-store',
    // Never follow 30x responses with a one-time reset URL in the body. This
    // keeps the token and authenticated delivery request pinned to the exact
    // operator-configured endpoint instead of trusting a redirected origin.
    redirect: 'error',
  })

  if (!response.ok) {
    throw new Error(`Entrega de recuperación rechazada (${response.status})`)
  }
}
