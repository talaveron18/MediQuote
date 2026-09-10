import { createHash } from 'node:crypto'
import { db } from './db'
import { normalizeRecoveryIdentifier } from './password-recovery'

const RATE_PREFIX = 'password_reset_rate:'
export const PASSWORD_RESET_RATE_WINDOW_MS = 15 * 60 * 1000
export const PASSWORD_RESET_IDENTIFIER_LIMIT = 5
export const PASSWORD_RESET_IP_LIMIT = 20

type CounterRecord = {
  windowStart: string
  count: number
}

type Tx = {
  appConfig: {
    findUnique(args: any): Promise<{ key: string; value: string } | null>
    upsert(args: any): Promise<unknown>
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function rateKey(scope: 'identifier' | 'ip', value: string): string {
  return `${RATE_PREFIX}${scope}:${digest(value)}`
}

function parseCounter(value: string | null | undefined): CounterRecord | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<CounterRecord>
    if (!parsed.windowStart || !Number.isSafeInteger(parsed.count) || Number(parsed.count) < 0) return null
    if (Number.isNaN(Date.parse(parsed.windowStart))) return null
    return { windowStart: parsed.windowStart, count: Number(parsed.count) }
  } catch {
    return null
  }
}

async function consumeCounter(tx: Tx, key: string, limit: number, now: Date): Promise<boolean> {
  const row = await tx.appConfig.findUnique({ where: { key } })
  const previous = parseCounter(row?.value)
  const expired = !previous || now.getTime() - new Date(previous.windowStart).getTime() >= PASSWORD_RESET_RATE_WINDOW_MS
  const current = expired ? { windowStart: now.toISOString(), count: 0 } : previous

  if (current.count >= limit) return false

  const next: CounterRecord = { ...current, count: current.count + 1 }
  await tx.appConfig.upsert({
    where: { key },
    create: { key, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  })
  return true
}

export type PasswordRecoveryRateLimitResult = {
  allowed: boolean
  identifierAllowed: boolean
  ipAllowed: boolean
}

/**
 * Persistent fixed-window limiter. Keys contain hashes only; neither the email
 * nor the source IP is stored in AppConfig. Limits are security controls, not
 * economic/business parameters.
 */
export async function recordPasswordRecoveryAttempt(
  identifier: string,
  sourceIp: string,
  now = new Date(),
): Promise<PasswordRecoveryRateLimitResult> {
  const normalizedIdentifier = normalizeRecoveryIdentifier(identifier)
  const normalizedIp = sourceIp.trim() || 'unknown'

  return db.$transaction(async (tx) => {
    const identifierAllowed = await consumeCounter(
      tx as Tx,
      rateKey('identifier', normalizedIdentifier),
      PASSWORD_RESET_IDENTIFIER_LIMIT,
      now,
    )
    const ipAllowed = await consumeCounter(
      tx as Tx,
      rateKey('ip', normalizedIp),
      PASSWORD_RESET_IP_LIMIT,
      now,
    )
    return { allowed: identifierAllowed && ipAllowed, identifierAllowed, ipAllowed }
  }, { isolationLevel: 'Serializable' })
}
