import { NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/auth'
import {
  consumeStoredPasswordRecovery,
  createStoredPasswordRecovery,
} from '@/lib/password-recovery-store'
import { recordPasswordRecoveryAttempt } from '@/lib/password-recovery-rate-limit'
import { deliverPasswordRecoveryLink } from '@/lib/password-recovery-delivery'
import { isValidRecoveryIdentifier, normalizeRecoveryIdentifier } from '@/lib/password-recovery'
import { buildTrustedPublicUrl } from '@/lib/public-origin'

export const runtime = 'nodejs'

const GENERIC_MESSAGE = 'Si existe una cuenta activa con ese correo, recibirás instrucciones para restablecer la contraseña.'

function genericResponse() {
  return NextResponse.json(
    { success: true, message: GENERIC_MESSAGE },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  )
}

function sourceIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(request: NextRequest) {
  let issuedRawToken: string | null = null
  try {
    const body = await request.json().catch(() => ({})) as { email?: unknown }
    const rawEmail = typeof body.email === 'string' ? body.email : ''
    const email = normalizeRecoveryIdentifier(rawEmail)

    // Keep the public response indistinguishable for malformed, unknown and known accounts.
    // Malformed identifiers are rejected before persistent rate-limit/DB work so arbitrary
    // oversized garbage cannot consume the shared IP recovery quota.
    if (!isValidRecoveryIdentifier(email)) {
      await logAudit({ action: 'password_reset_requested', entity: 'user', summary: 'Solicitud de recuperación recibida' })
      return genericResponse()
    }

    const rate = await recordPasswordRecoveryAttempt(email, sourceIp(request))
    if (!rate.allowed) {
      await logAudit({
        action: 'password_reset_rate_limited',
        entity: 'user',
        summary: 'Solicitud de recuperación limitada por control antiabuso',
        result: 'blocked',
      })
      return genericResponse()
    }

    await logAudit({ action: 'password_reset_requested', entity: 'user', summary: 'Solicitud de recuperación recibida' })
    const issued = await createStoredPasswordRecovery(email)
    if (!issued) return genericResponse()

    issuedRawToken = issued.rawToken
    const resetUrl = buildTrustedPublicUrl({
      path: '/restablecer-password',
      requestOrigin: request.nextUrl.origin,
      configuredOrigin: process.env.MEDIQUOTE_PUBLIC_ORIGIN,
    })
    resetUrl.searchParams.set('token', issued.rawToken)

    try {
      await deliverPasswordRecoveryLink({
        recipient: email,
        resetUrl: resetUrl.toString(),
        expiresAt: issued.expiresAt,
      })
      await logAudit({
        action: 'password_reset_email_queued',
        entity: 'user',
        entityId: issued.userId,
        // SMTP acceptance is not proof of delivery to the recipient mailbox.
        summary: 'Correo de recuperación aceptado por el transporte SMTP configurado; recepción final no verificada',
      })
    } catch (deliveryError) {
      // Fail closed: never leave a usable token behind if the delivery channel failed.
      await consumeStoredPasswordRecovery(issued.rawToken)
      issuedRawToken = null
      await logAudit({
        action: 'password_reset_delivery_failed',
        entity: 'user',
        entityId: issued.userId,
        summary: 'No se pudo entregar el enlace de recuperación; token invalidado',
        result: 'error',
        // Delivery errors are deliberately credential-free; never record the
        // raw token/reset URL or SMTP password in audit data.
        errorMessage: deliveryError instanceof Error ? deliveryError.message : 'Error de entrega',
      })
    }

    return genericResponse()
  } catch {
    // If an unexpected error happens after issuance, consume the token whenever possible.
    if (issuedRawToken) {
      await consumeStoredPasswordRecovery(issuedRawToken).catch(() => null)
    }
    console.error('[POST /api/recovery/password/request] Internal recovery error')
    // Enumeration-safe response even on internal failures.
    return genericResponse()
  }
}
