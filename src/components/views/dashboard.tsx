'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Search, Eye, Copy, Trash2, Filter, FileText } from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import type { BudgetStatus, ServiceBlockInput } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────

interface BudgetRow {
  id: string
  code: string
  status: BudgetStatus
  totalFinal: number
  subtotal: number
  totalSurcharges: number
  discountPercent: number
  discountAmount: number
  ivaPercent: number
  ivaAmount: number
  createdAt: string
  description: string | null
  validUntil: string | null
  clientNotes: string | null
  internalNotes: string | null
  clientId: string
  client: {
    businessName: string
    cif: string
  }
  _count: {
    serviceBlocks: number
  }
  serviceBlocks?: ServiceBlockInput[]
}

// ─── Helpers ────────────────────────────────────────────────────────

const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
})

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('es-ES')
}

const STATUS_VARIANT: Record<
  BudgetStatus,
  { variant: 'outline' | 'secondary' | 'default' | 'destructive'; className?: string }
> = {
  borrador: { variant: 'outline' },
  enviado: { variant: 'secondary' },
  aceptado: { variant: 'default' },
  rechazado: { variant: 'destructive' },
  caducado: { variant: 'outline', className: 'text-orange-600' },
}

const STATUS_LABEL: Record<BudgetStatus, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  caducado: 'Caducado',
}

// ─── Component ──────────────────────────────────────────────────────

export default function Dashboard() {
  const store = useAppStore()

  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')

  // ── Fetch budgets ────────────────────────────────────────────────

  const fetchBudgets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter && statusFilter !== 'todos') {
        params.set('status', statusFilter)
      }

      const res = await fetch(`/api/budgets?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar presupuestos')

      const data = await res.json()
      setBudgets(data.budgets ?? [])
    } catch (err) {
      console.error('[Dashboard] fetchBudgets error:', err)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    fetchBudgets()
  }, [fetchBudgets])

  // ── Handlers ─────────────────────────────────────────────────────

  function handleNewBudget() {
    store.newBudget()
    store.setView('budget-new')
  }

  function handleEdit(id: string) {
    store.editBudget(id)
  }

  async function handleDelete(id: string, code: string) {
    const confirmed = window.confirm(
      `¿Estás seguro de que deseas eliminar el presupuesto ${code}?\n\nEl presupuesto se marcará como caducado (eliminación suave).`,
    )
    if (!confirmed) return

    try {
      const res = await fetch(`/api/budgets?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Error al eliminar')
      await fetchBudgets()
    } catch (err) {
      console.error('[Dashboard] handleDelete error:', err)
    }
  }

  async function handleDuplicate(id: string, code: string) {
    try {
      // Fetch the source budget by code
      const res = await fetch(
        `/api/budgets?search=${encodeURIComponent(code)}`,
      )
      if (!res.ok) throw new Error('Error al obtener presupuesto')
      const data = await res.json()
      const source = (data.budgets ?? []).find(
        (b: BudgetRow) => b.id === id,
      )
      if (!source) {
        alert('No se encontró el presupuesto a duplicar.')
        return
      }

      // Una copia debe recalcularse: no reutilizamos una cotización económica
      // antigua ni su snapshot interno.
      store.newBudget()
      store.setBudgetForm({
        clientId: source.clientId,
        description: [source.description ?? '', '(Copia)'].filter(Boolean).join(' '),
        status: 'borrador',
        validUntil: source.validUntil ?? undefined,
        discountPercent: source.discountPercent,
        ivaPercent: source.ivaPercent,
        clientNotes: source.clientNotes ?? undefined,
      })
      store.setServiceBlocks(source.serviceBlocks ?? [])
      store.setView('budget-new')
    } catch (err) {
      console.error('[Dashboard] handleDuplicate error:', err)
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
  }

  // ── Derived ──────────────────────────────────────────────────────

  const filteredCount = budgets.length

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Presupuestos</h1>
          <p className="text-sm text-muted-foreground">
            Gestión de presupuestos GASI
          </p>
        </div>
        <Button onClick={handleNewBudget}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Presupuesto
        </Button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={handleSearchSubmit}
            className="flex flex-col gap-4 sm:flex-row sm:items-center"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por código, descripción o cliente..."
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="borrador">Borrador</SelectItem>
                  <SelectItem value="enviado">Enviado</SelectItem>
                  <SelectItem value="aceptado">Aceptado</SelectItem>
                  <SelectItem value="rechazado">Rechazado</SelectItem>
                  <SelectItem value="caducado">Caducado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {filteredCount} resultado{filteredCount !== 1 ? 's' : ''}
            </span>
          </form>
        </CardContent>
      </Card>

      {/* ── Table or Empty ──────────────────────────────────────── */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span className="text-sm">Cargando presupuestos...</span>
            </div>
          </CardContent>
        </Card>
      ) : budgets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <div className="text-center">
              <p className="text-lg font-medium text-muted-foreground">
                No hay presupuestos
              </p>
              <p className="text-sm text-muted-foreground/70">
                Crea el primero.
              </p>
            </div>
            <Button onClick={handleNewBudget} variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Presupuesto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Código</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="w-[120px]">Estado</TableHead>
                  <TableHead className="w-[140px] text-right">Importe</TableHead>
                  <TableHead className="w-[120px]">Fecha</TableHead>
                  <TableHead className="w-[180px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map((budget) => {
                  const badgeConfig = STATUS_VARIANT[budget.status]
                  return (
                    <TableRow key={budget.id}>
                      {/* Código */}
                      <TableCell className="font-mono text-sm font-medium">
                        {budget.code}
                      </TableCell>

                      {/* Cliente */}
                      <TableCell>
                        <div>
                          <span className="font-medium">
                            {budget.client.businessName}
                          </span>
                          {budget.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {budget.description}
                            </p>
                          )}
                        </div>
                      </TableCell>

                      {/* Estado */}
                      <TableCell>
                        <Badge
                          variant={badgeConfig.variant}
                          className={badgeConfig.className}
                        >
                          {STATUS_LABEL[budget.status]}
                        </Badge>
                      </TableCell>

                      {/* Importe */}
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(budget.totalFinal)}
                      </TableCell>

                      {/* Fecha */}
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(budget.createdAt)}
                      </TableCell>

                      {/* Acciones */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Editar"
                            onClick={() => handleEdit(budget.id)}
                          >
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">Editar</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Duplicar"
                            onClick={() =>
                              handleDuplicate(budget.id, budget.code)
                            }
                          >
                            <Copy className="h-4 w-4" />
                            <span className="sr-only">Duplicar</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Eliminar"
                            onClick={() =>
                              handleDelete(budget.id, budget.code)
                            }
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Eliminar</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
