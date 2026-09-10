export type PasswordRecoveryDeliveryInput = {
  recipient: string
  resetUrl: string
  expiresAt: Date
}

/**
 * Provider-neutral delivery adapter. Production must configure an authenticated
 * HTTPS webhook owned by the selected transactional mail/SMTP integration.
 * No provider or credentials are hard-coded in MediQuote.
 */
export async function deliverPasswordRecoveryLink(input: PasswordRecoveryDeliveryInput): Promise<void> {
  const webhookUrl = process.env.PASSWORD_RESET_DELIVERY_WEBHOOK_URL?.trim()
  const bearerToken = process.env.PASSWORD_RESET_DELIVERY_BEARER_TOKEN?.trim()

  if (!webhookUrl) {
    throw new Error('PASSWORD_RESET_DELIVERY_WEBHOOK_URL no configurado')
  }
  const url = new URL(webhookUrl)
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('El webhook de recuperación debe usar HTTPS en producción')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
    },
    body: JSON.stringify({
      type: 'password_recovery',
      recipient: input.recipient,
      resetUrl: input.resetUrl,
      expiresAt: input.expiresAt.toISOString(),
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Entrega de recuperación rechazada (${response.status})`)
  }
}
