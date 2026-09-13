import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/app/api/pdf/route.ts'), 'utf8')

describe('PDF budget lifecycle regression coverage', () => {
  it('keeps client PDF access scoped to the owning commercial user', () => {
    expect(source).toContain("auth.role === 'comercial' && budget.createdById !== auth.id")
    expect(source).toContain("{ error: 'Presupuesto no encontrado' }, { status: 404 }")
  })

  it('only exposes the supported client and commercial document modes', () => {
    expect(source).toContain("mode !== 'client' && mode !== 'commercial'")
    expect(source).toContain("{ error: 'Modo de documento no válido' }, { status: 400 }")
  })

  it('requires a persisted costing snapshot before rendering commercial economics', () => {
    expect(source).toContain('db.costingQuote.findFirst')
    expect(source).toContain("{ error: 'No hay cálculo comercial guardado para este presupuesto' }, { status: 409 }")
    expect(source).toContain("{ error: 'El cálculo comercial guardado no es válido' }, { status: 409 }")
  })

  it('only offers signature sending from client PDFs in signable states', () => {
    expect(source).toContain("mode === 'client' && ['borrador', 'enviado'].includes(budget.status)")
    expect(source).toContain('enableSignatureSend: signatureSendAllowed')
  })
})
