import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = readFileSync('src/app/api/clients/route.ts', 'utf8')

describe('client integrity boundary', () => {
  it('GET valida allowlist y duplicados de query antes de buscar', () => {
    expect(route).toContain("validateQueryContract(searchParams, new Set(['search']))")
    expect(route).toContain('searchParams.getAll(key).length > 1')
    expect(route.indexOf("validateQueryContract(searchParams, new Set(['search']))"))
      .toBeLessThan(route.indexOf('db.client.findMany'))
  })

  it('POST rechaza campos fuera del contrato antes de crear', () => {
    const postStart = route.indexOf('export async function POST')
    const putStart = route.indexOf('export async function PUT')
    const post = route.slice(postStart, putStart)
    expect(post).toContain('unsupportedBodyFields(body, CLIENT_FIELDS)')
    expect(post.indexOf('unsupportedBodyFields(body, CLIENT_FIELDS)'))
      .toBeLessThan(post.indexOf('db.client.create'))
  })

  it('DELETE exige selector id único, sin parámetros laterales y normalizado', () => {
    const deleteStart = route.indexOf('export async function DELETE')
    const deletion = route.slice(deleteStart)
    expect(deletion).toContain("validateQueryContract(searchParams, new Set(['id']))")
    expect(deletion).toContain("if (!id?.trim())")
    expect(deletion).toContain('const normalizedId = id.trim()')
  })

  it('DELETE comprueba presupuestos y borra cliente dentro de transacción serializable', () => {
    const deleteStart = route.indexOf('export async function DELETE')
    const deletion = route.slice(deleteStart)
    expect(deletion).toContain('db.$transaction(async (tx) =>')
    expect(deletion).toContain('tx.budget.count')
    expect(deletion).toContain('tx.client.delete')
    expect(deletion).toContain("isolationLevel: 'Serializable'")
    expect(deletion.indexOf('tx.budget.count')).toBeLessThan(deletion.indexOf('tx.client.delete'))
  })
})
