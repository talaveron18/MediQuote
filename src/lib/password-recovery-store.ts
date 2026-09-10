import { db } from './db'
import {
  createPasswordRecoveryToken,
  hashRecoveryToken,
  isRecoveryRecordUsable,
  normalizeRecoveryIdentifier,
} from './password-recovery'

const RESET_PREFIX = 'password_reset:'
const SESSION_PREFIX = 'session_generation:'

type StoredReset = {
  userId: string
  tokenHash: string
  expiresAt: string
  usedAt: string | null
}

function resetKey(tokenHash: string): string {
  return `${RESET_PREFIX}${tokenHash}`
}

function sessionKey(userId: string): string {
  return `${SESSION_PREFIX}${userId}`
}

function parseStoredReset(value: string): StoredReset | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredReset>
    if (!parsed.userId || !parsed.tokenHash || !parsed.expiresAt) return null
    return {
      userId: parsed.userId,
      tokenHash: parsed.tokenHash,
      expiresAt: parsed.expiresAt,
      usedAt: parsed.usedAt ?? null,
    }
  } catch {
    return null
  }
}

async function invalidatePreviousRecoveries(userId: string, now: Date): Promise<void> {
  const rows = await db.appConfig.findMany({
    where: { key: { startsWith: RESET_PREFIX } },
    select: { key: true, value: true },
  })

  for (const row of rows) {
    const stored = parseStoredReset(row.value)
    if (!stored || stored.userId !== userId || stored.usedAt) continue
    const invalidated: StoredReset = { ...stored, usedAt: now.toISOString() }
    await db.appConfig.updateMany({
      where: { key: row.key, value: row.value },
      data: { value: JSON.stringify(invalidated) },
    })
  }
}

export async function createStoredPasswordRecovery(email: string, now = new Date()) {
  const normalized = normalizeRecoveryIdentifier(email)
  const user = await db.user.findUnique({ where: { email: normalized }, select: { id: true, active: true } })
  // The caller must always return the same generic response whether this is null or not.
  if (!user?.active) return null

  // A later request must invalidate every earlier unused token for the same user.
  await invalidatePreviousRecoveries(user.id, now)

  const token = createPasswordRecoveryToken(now)
  const stored: StoredReset = {
    userId: user.id,
    tokenHash: token.tokenHash,
    expiresAt: token.expiresAt.toISOString(),
    usedAt: null,
  }
  await db.appConfig.create({
    data: { key: resetKey(token.tokenHash), value: JSON.stringify(stored) },
  })
  return { rawToken: token.rawToken, expiresAt: token.expiresAt, userId: user.id }
}

export async function consumeStoredPasswordRecovery(rawToken: string, now = new Date()): Promise<string | null> {
  const tokenHash = hashRecoveryToken(rawToken)
  const key = resetKey(tokenHash)
  const row = await db.appConfig.findUnique({ where: { key } })
  const stored = parseStoredReset(row?.value ?? '')
  if (!row || !stored) return null

  const usable = isRecoveryRecordUsable({
    tokenHash: stored.tokenHash,
    expiresAt: new Date(stored.expiresAt),
    usedAt: stored.usedAt ? new Date(stored.usedAt) : null,
  }, rawToken, now)
  if (!usable) return null

  const consumed: StoredReset = { ...stored, usedAt: now.toISOString() }
  // Atomic compare-and-set: only one concurrent request can consume the same raw record.
  const updated = await db.appConfig.updateMany({
    where: { key, value: row.value },
    data: { value: JSON.stringify(consumed) },
  })
  return updated.count === 1 ? stored.userId : null
}

export async function getSessionGeneration(userId: string): Promise<number> {
  const row = await db.appConfig.findUnique({ where: { key: sessionKey(userId) } })
  const value = Number(row?.value ?? '1')
  return Number.isSafeInteger(value) && value >= 1 ? value : 1
}

export async function bumpSessionGeneration(userId: string): Promise<number> {
  return db.$transaction(async (tx) => {
    const key = sessionKey(userId)
    const row = await tx.appConfig.findUnique({ where: { key } })
    const current = Number(row?.value ?? '1')
    const normalized = Number.isSafeInteger(current) && current >= 1 ? current : 1
    const next = normalized + 1
    await tx.appConfig.upsert({
      where: { key },
      create: { key, value: String(next) },
      update: { value: String(next) },
    })
    return next
  }, { isolationLevel: 'Serializable' })
}
