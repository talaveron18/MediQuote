import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const source = readFileSync(resolve(root, 'src/app/api/notifications/route.ts'), 'utf8')

describe('notification integrity', () => {
  it('rejects unsupported GET query parameters', () => {
    expect(source).toContain('const params = request.nextUrl.searchParams')
    expect(source).toContain('[...params.keys()].length > 0')
    expect(source).toContain("return privateNoStoreJson({ error: 'Parámetros no admitidos' }, { status: 400 })")
  })

  it('counts all unread notifications instead of only the visible top 100', () => {
    expect(source).toContain('const [notifications, unreadCount] = await Promise.all([')
    expect(source).toContain('db.notification.count({ where: { userId: auth.id, readAt: null } })')
    expect(source).toContain('return privateNoStoreJson({ notifications, unreadCount })')
    expect(source).not.toContain('notifications.filter((item) => !item.readAt).length')
  })

  it('keeps PATCH input on an explicit allowlist', () => {
    expect(source).toContain("hasOnlyKeys(input, ['id', 'all'])")
    expect(source).toContain("return privateNoStoreJson({ error: 'Solicitud no válida' }, { status: 400 })")
  })

  it('requires exactly one unambiguous mark-read mode', () => {
    expect(source).toContain("const markOne = typeof id === 'string' && id.trim().length > 0 && all === undefined")
    expect(source).toContain('const markAll = id === undefined && all === true')
    expect(source).toContain('if (!markOne && !markAll)')
    expect(source).toContain("return privateNoStoreJson({ error: 'Selector de notificación no válido' }, { status: 400 })")
  })
})
