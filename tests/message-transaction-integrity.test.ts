import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const source = readFileSync(resolve(root, 'src/app/api/messages/route.ts'), 'utf8')

describe('internal message transaction integrity', () => {
  it('creates the message and its notification inside the same database transaction', () => {
    const transaction = source.match(/const message = await db\.\$transaction\(async \(tx\) => \{([\s\S]*?)\n  \}\);/)
    expect(transaction).not.toBeNull()
    expect(transaction?.[1]).toContain('tx.internalMessage.create')
    expect(transaction?.[1]).toContain('tx.notification.create')
    expect(transaction?.[1]).toContain('entityId: created.id')
  })

  it('does not create the notification outside the transactional create block', () => {
    expect(source).not.toMatch(/await db\.notification\.create\(/)
  })
})
