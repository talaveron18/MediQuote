'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import type { ClientDTO } from '@/lib/types'
import { useToast, toast } from '@/hooks/use-toast'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Edit, Trash2, Search } from 'lucide-react'

// ─── Empty form template ──────────────────────────────────────────
const emptyClient: ClientDTO = {
  businessName: '',
  cif: '',
  fiscalAddress: '',
  contactPerson: '',
  email: '',
  phone: '',
  sector: '',
  paymentTerms: '',
  notes: '',
}

export default function ClientsView() {
  const { clients, setClients } = useAppStore()
  const { toast } = useToast()

  // ── Local state ─────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ClientDTO>({ ...emptyClient })
  const [saving, setSaving] = useState(false)

  // ── Fetch clients on mount ───────────────────────────────────────
  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/clients')
      if (!res.ok) throw new Error()
      const data: ClientDTO[] = await res.json()
      setClients(data)
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar los clientes', variant: 'destructive' })
    }
  }, [setClients, toast])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  // ── Filtered list ───────────────────────────────────────────────
  const filtered = clients.filter((c) => {
    const q = search.toLowerCase()
    return (
      c.businessName.toLowerCase().includes(q) ||
      c.cif.toLowerCase().includes(q) ||
      (c.contactPerson ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.sector ?? '').toLowerCase().includes(q)
    )
  })

  // ── Dialog helpers ──────────────────────────────────────────────
  const openNew = () => {
    setForm({ ...emptyClient })
    setEditing(false)
    setDialogOpen(true)
  }

  const openEdit = (client: ClientDTO) => {
    setForm({ ...client })
    setEditing(true)
    setDialogOpen(true)
  }

  // ── Save (POST or PUT) ─────────────────────────────────────────
  const handleSave = async () => {
    if (!form.businessName.trim() || !form.cif.trim() || !form.fiscalAddress.trim()) {
      toast({ title: 'Campos obligatorios', description: 'Razón social, CIF y Dirección fiscal son obligatorios', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch('/api/clients', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      toast({ title: editing ? 'Cliente actualizado' : 'Cliente creado', description: form.businessName })
      setDialogOpen(false)
      fetchClients()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────
  const handleDelete = async (client: ClientDTO) => {
    if (!client.id) return
    if (!confirm(`¿Eliminar el cliente "${client.businessName}"?`)) return

    try {
      const res = await fetch(`/api/clients?id=${client.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al eliminar')
      }
      toast({ title: 'Cliente eliminado', description: client.businessName })
      fetchClients()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  // ── Form field updater ──────────────────────────────────────────
  const updateField = <K extends keyof ClientDTO>(key: K, value: ClientDTO[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Cliente
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por razón social, CIF, contacto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razón Social</TableHead>
                  <TableHead>CIF</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No se encontraron clientes.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.businessName}</TableCell>
                      <TableCell>{client.cif}</TableCell>
                      <TableCell>{client.contactPerson ?? '—'}</TableCell>
                      <TableCell>{client.email ?? '—'}</TableCell>
                      <TableCell>{client.phone ?? '—'}</TableCell>
                      <TableCell>{client.sector ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(client)} title="Editar">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(client)}
                            title="Eliminar"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── New / Edit Dialog ─────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Razón social */}
            <div className="grid gap-2">
              <Label htmlFor="businessName">Razón social *</Label>
              <Input
                id="businessName"
                value={form.businessName}
                onChange={(e) => updateField('businessName', e.target.value)}
                placeholder="Nombre legal de la empresa"
              />
            </div>

            {/* CIF / NIF */}
            <div className="grid gap-2">
              <Label htmlFor="cif">CIF / NIF *</Label>
              <Input
                id="cif"
                value={form.cif}
                onChange={(e) => updateField('cif', e.target.value)}
                placeholder="Ej: A12345678"
              />
            </div>

            {/* Dirección fiscal */}
            <div className="grid gap-2">
              <Label htmlFor="fiscalAddress">Dirección fiscal *</Label>
              <Input
                id="fiscalAddress"
                value={form.fiscalAddress}
                onChange={(e) => updateField('fiscalAddress', e.target.value)}
                placeholder="Dirección completa"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Persona de contacto */}
              <div className="grid gap-2">
                <Label htmlFor="contactPerson">Persona de contacto</Label>
                <Input
                  id="contactPerson"
                  value={form.contactPerson ?? ''}
                  onChange={(e) => updateField('contactPerson', e.target.value)}
                  placeholder="Nombre del contacto"
                />
              </div>

              {/* Email */}
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="correo@empresa.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Teléfono */}
              <div className="grid gap-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={form.phone ?? ''}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="600 000 000"
                />
              </div>

              {/* Sector */}
              <div className="grid gap-2">
                <Label htmlFor="sector">Sector</Label>
                <Input
                  id="sector"
                  value={form.sector ?? ''}
                  onChange={(e) => updateField('sector', e.target.value)}
                  placeholder="Ej: Sanidad, Industria..."
                />
              </div>
            </div>

            {/* Condiciones de pago */}
            <div className="grid gap-2">
              <Label htmlFor="paymentTerms">Condiciones de pago</Label>
              <Input
                id="paymentTerms"
                value={form.paymentTerms ?? ''}
                onChange={(e) => updateField('paymentTerms', e.target.value)}
                placeholder="Ej: Neto 30 días"
              />
            </div>

            {/* Observaciones internas */}
            <div className="grid gap-2">
              <Label htmlFor="notes">Observaciones internas</Label>
              <Textarea
                id="notes"
                value={form.notes ?? ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Notas internas sobre el cliente..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}