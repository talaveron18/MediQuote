import { db } from './db'
import { hashRecoveryToken, isRecoveryRecordUsable } from './password-recovery'

const RESET_PREFIX = 'password_reset:'
const SESSION_PREFIX = 'session_generation:'

type StoredReset = {
  userId: string
  tokenHash: string
  expiresAt: string
  usedAt: string | null
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

async function bumpSessionGenerationTx(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], userId: string) {
  const key = `${SESSION_PREFIX}${userId}`
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
}

async function invalidateOtherRecoveriesTx(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  userId: string,
  now: Date,
  exceptKey?: string,
) {
  const rows = await tx.appConfig.findMany({
    where: { key: { startsWith: RESET_PREFIX } },
    select: { key: true, value: true },
  })
  for (const row of rows) {
    if (row.key === exceptKey) continue
    const stored = parseStoredReset(row.value)
    if (!stored || stored.userId !== userId || stored.usedAt) continue
    await tx.appConfig.updateMany({
      where: { key: row.key, value: row.value },
      data: { value: JSON.stringify({ ...stored, usedAt: now.toISOString() }) },
    })
  }
}

/**
 * Completes a reset atomically: token consumption, password replacement,
 * invalidation of sibling recovery tokens and session revocation either all
 * commit together or none of them do.
 */
export async function completePasswordRecovery(
  rawToken: string,
  passwordHash: string,
  now = new Date(),
) {
  const tokenHash = hashRecoveryToken(rawToken)
  const key = `${RESET_PREFIX}${tokenHash}`

  return db.$transaction(async (tx) => {
    const row = await tx.appConfig.findUnique({ where: { key } })
    const stored = parseStoredReset(row?.value ?? '')
    if (!row || !stored) return null

    const usable = isRecoveryRecordUsable({
      tokenHash: stored.tokenHash,
      expiresAt: new Date(stored.expiresAt),
      usedAt: stored.usedAt ? new Date(stored.usedAt) : null,
    }, rawToken, now)
    if (!usable) return null

    const user = await tx.user.findUnique({
      where: { id: stored.userId },
      select: { id: true, email: true, name: true, role: true, active: true },
    })
    if (!user?.active) return null

    const consumed = { ...stored, usedAt: now.toISOString() }
    const claimed = await tx.appConfig.updateMany({
      where: { key, value: row.value },
      data: { value: JSON.stringify(consumed) },
    })
    if (claimed.count !== 1) return null

    await tx.user.update({
      where: { id: user.id },
      data: { password: passwordHash, mustChangePassword: false },
    })
    await invalidateOtherRecoveriesTx(tx, user.id, now, key)
    const sessionGeneration = await bumpSessionGenerationTx(tx, user.id)
    return { ...user, sessionGeneration }
  }, { isolationLevel: 'Serializable' })
}

/**
 * Used by an authenticated password change. Any outstanding reset link is
 * invalidated in the same transaction as the password and session generation.
 */
export async function changePasswordAndRevokeRecovery(
  userId: string,
  passwordHash: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { password: passwordHash, mustChangePassword: false },
    })
    await invalidateOtherRecoveriesTx(tx, userId, now)
    return bumpSessionGenerationTx(tx, userId)
  }, { isolationLevel: 'Serializable' })
}
