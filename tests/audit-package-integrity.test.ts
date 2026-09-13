import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const source = readFileSync(resolve(root, 'src/app/api/audit-package/route.ts'), 'utf8')

describe('audit package evidence integrity', () => {
  it('uses sub-minute unique package names and refuses silent directory reuse', () => {
    expect(source).toContain("String(now.getSeconds()).padStart(2, '0')")
    expect(source).toContain("String(now.getMilliseconds()).padStart(3, '0')")
    expect(source).toContain('mkdirSync(auditDir, { recursive: false })')
  })

  it('exports the complete ordered audit log without a silent 10k cap', () => {
    const findManyBlock = source.match(/const auditLogs = await db\.auditLog\.findMany\(\{([\s\S]*?)\}\);/)
    expect(findManyBlock).not.toBeNull()
    expect(findManyBlock?.[1]).toContain("orderBy: { createdAt: 'asc' }")
    expect(findManyBlock?.[1]).not.toMatch(/\btake\s*:/)
  })

  it('neutralizes spreadsheet-formula prefixes in CSV while JSONL preserves raw evidence', () => {
    expect(source).toContain("/^[=+\\-@]/.test(value.trimStart())")
    expect(source).toContain("? `'${value}` : value")
    expect(source).toContain('const jsonlLines = auditLogs.map')
    expect(source).toContain('message: log.errorMessage || log.summary || null')
  })

  it('copies only regular non-symlink PDF and JSON evidence files', () => {
    expect(source).toContain("path.extname(f).toLowerCase() !== '.pdf'")
    expect(source).toContain("path.extname(f).toLowerCase() !== '.json'")
    expect(source).toMatch(/await fs\.lstat\(src\)/)
    expect(source).toMatch(/stat\.isFile\(\) && !stat\.isSymbolicLink\(\)/)
    expect(source).toContain('path.basename(f)')
  })
})
