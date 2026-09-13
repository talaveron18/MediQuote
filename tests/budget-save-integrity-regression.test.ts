import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/app/api/budgets/route.ts'), 'utf8')

describe('budget save integrity regression coverage', () => {
  it('requires a live single-use costing quote before creating a budget', () => {
    expect(source).toContain('const previewQuote = await getValidCostingQuote(auth.id, calculationToken)')
    expect(source).toContain('La cotización económica falta, ha caducado o ya fue utilizada. Vuelve a calcular.')
    expect(source).toContain('const costingQuote = await claimCostingQuote(tx, auth.id, calculationToken, sealedAt)')
    expect(source).toContain('La cotización económica ya fue utilizada por otro guardado. Vuelve a calcular.')
  })

  it('persists create-time economics from the claimed quote rather than request totals', () => {
    expect(source).toContain('subtotal: costingQuote.subtotal as number')
    expect(source).toContain('discountPercent: costingQuote.discountPercent as number')
    expect(source).toContain('discountAmount: costingQuote.discountAmount as number')
    expect(source).toContain('ivaAmount: costingQuote.ivaAmount as number')
    expect(source).toContain('totalFinal: costingQuote.totalFinal as number')
  })

  it('requires a fresh costing quote for economic edits and rebuilds persisted blocks from its snapshot', () => {
    expect(source).toContain('const previewQuote = updatesEconomicData ? await getValidCostingQuote(auth.id, calculationToken) : null')
    expect(source).toContain('const processedBlocks = previewQuote ? blocksFromCostingSnapshot(previewQuote.snapshot) : undefined')
    expect(source).toContain('await tx.serviceBlock.deleteMany({ where: { budgetId: id } })')
    expect(source).toContain('subtotal: costingQuote.subtotal as number')
  })

  it('keeps accepted, rejected and expired budgets closed to ordinary edits', () => {
    expect(source).toContain("if (existing.status === 'aceptado')")
    expect(source).toContain("if (existing.status === 'rechazado')")
    expect(source).toContain("if (existing.status === 'caducado')")
    expect(source).toContain('La aceptación solo puede registrarse mediante el circuito de firma electrónica.')
    expect(source).toContain('El estado enviado solo puede registrarse al emitir una solicitud de firma.')
    expect(source).toContain('La caducidad debe registrarse mediante el cierre controlado del presupuesto.')
  })
})
