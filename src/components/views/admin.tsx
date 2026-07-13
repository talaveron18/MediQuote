'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import type {
  SurchargeConfigDTO,
  LaborRuleDTO,
  HolidayInfo,
  HolidayType,
  SurchargeType,
  SurchargeKind,
  UserRole,
  CategoryDTO,
} from '@/lib/types'
import { useToast, toast } from '@/hooks/use-toast'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Edit, Trash2, Shield } from 'lucide-react'
import RemoteConfigPanel from '@/components/views/remote-config-panel'
import AdminAuditPanel from '@/components/views/admin-audit-panel'
import BrandingPanel from '@/components/views/branding-panel'
import UsersPanel from '@/components/views/users-panel'
import LegalRecordsPanel from '@/components/views/legal-records-panel'
import LegalParametersPanel from '@/components/views/legal-parameters-panel'

// ─── Constants ────────────────────────────────────────────────────

const SURCHARGE_TYPE_OPTIONS: { value: SurchargeType; label: string }[] = [
  { value: 'nocturnidad', label: 'Nocturnidad' },
  { value: 'domingo', label: 'Domingo' },
  { value: 'festivo', label: 'Festivo' },
  { value: 'urgencia', label: 'Urgencia' },
  { value: 'dificil_cobertura', label: 'Difícil cobertura' },
  { value: 'desplazamiento', label: 'Desplazamiento' },
  { value: 'guardia_24h', label: 'Guardia 24h' },
  { value: 'fin_de_semana', label: 'Fin de semana' },
  { value: 'municipio_especial', label: 'Municipio especial' },
  { value: 'servicio_premium', label: 'Servicio premium' },
  { value: 'festivo_nacional', label: 'Festivo nacional' },
  { value: 'festivo_autonomico', label: 'Festivo autonómico' },
  { value: 'festivo_provincial', label: 'Festivo provincial' },
  { value: 'festivo_municipal', label: 'Festivo municipal' },
]

const SURCHARGE_KIND_OPTIONS: { value: SurchargeKind; label: string }[] = [
  { value: 'percentage', label: 'Porcentaje (%)' },
  { value: 'fixed', label: 'Fijo (€)' },
  { value: 'multiplier', label: 'Multiplicador' },
  { value: 'special_price', label: 'Precio especial (€/h)' },
]

const HOLIDAY_TYPE_OPTIONS: { value: HolidayType; label: string }[] = [
  { value: 'nacional', label: 'Nacional' },
  { value: 'autonomico', label: 'Autonómico' },
  { value: 'provincial', label: 'Provincial' },
  { value: 'municipal', label: 'Municipal' },
]

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'readonly', label: 'Solo lectura' },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  comercial: 'Comercial',
  gestor: 'Gestor',
  readonly: 'Solo lectura',
}

const COMPANY_FIELDS = [
  { key: 'company_name', label: 'Nombre de la empresa' },
  { key: 'company_cif', label: 'CIF de la empresa' },
  { key: 'company_address', label: 'Dirección' },
  { key: 'company_phone', label: 'Teléfono' },
  { key: 'company_email', label: 'Email' },
  { key: 'iva_default', label: 'IVA por defecto (%)' },
  { key: 'valid_days_default', label: 'Días de validez por defecto' },
]

// ─── Local interfaces (DB response shapes) ────────────────────────

interface CategoryRow extends CategoryDTO {
  id: string
  active: boolean
}

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  active: boolean
}

// ═══════════════════════════════════════════════════════════════════
//  ADMIN VIEW
// ═══════════════════════════════════════════════════════════════════

export default function AdminView() {
  const {
    currentRole,
    categories,
    setCategories,
    surcharges,
    setSurcharges,
    laborRule,
    setLaborRule,
    holidays,
    setHolidays,
    appConfig,
    setAppConfig,
  } = useAppStore()

  const { toast } = useToast()

  const isMaestro = currentRole === 'maestro';

  // ── Guard: admin or maestro only ────────────────────────────────
  if (currentRole !== 'admin' && currentRole !== 'maestro') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
        <Shield className="h-12 w-12" />
        <p className="text-lg">Acceso restringido. Se requiere rol de administrador.</p>
      </div>
    )
  }

  // ── Fetch all config on mount ────────────────────────────────────
  // (handled in the returned component below so hooks are called unconditionally)
  return <AdminPanel />
}

function AdminPanel() {
  const {
    currentRole,
    categories,
    setCategories,
    surcharges,
    setSurcharges,
    laborRule,
    setLaborRule,
    holidays,
    setHolidays,
    appConfig,
    setAppConfig,
  } = useAppStore()

  const isMaestro = currentRole === 'maestro'
  const { toast } = useToast()

  // ── Users (stored locally, not in Zustand) ──────────────────────
  const [users, setUsers] = useState<UserRow[]>([])

  // ── LaborRules array from API ───────────────────────────────────
  const [laborRules, setLaborRules] = useState<LaborRuleDTO[]>([])

  // ── Dialog states ───────────────────────────────────────────────
  const [catDialogOpen, setCatDialogOpen] = useState(false)
  const [catEditing, setCatEditing] = useState(false)
  const [catForm, setCatForm] = useState<Partial<CategoryRow>>({
    name: '',
    description: '',
    defaultPricePerHour: 0,
    defaultInternalCost: 0,
    active: true,
  })

  const [surDialogOpen, setSurDialogOpen] = useState(false)
  const [surEditing, setSurEditing] = useState(false)
  const [surForm, setSurForm] = useState<Partial<SurchargeConfigDTO>>({
    name: '',
    type: 'nocturnidad',
    surchargeType: 'percentage',
    value: 0,
    description: '',
    active: true,
  })

  const [holDialogOpen, setHolDialogOpen] = useState(false)
  const [holForm, setHolForm] = useState<Partial<HolidayInfo & { id?: string }>>({
    date: '',
    name: '',
    type: 'nacional',
    autonomousCommunity: '',
    province: '',
  })

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [ruleForm, setRuleForm] = useState<Partial<LaborRuleDTO>>({})

  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [userForm, setUserForm] = useState<Partial<UserRow>>({
    name: '',
    email: '',
    role: 'comercial',
  })

  // ── Holiday filters ─────────────────────────────────────────────
  const [holYear, setHolYear] = useState(new Date().getFullYear().toString())
  const [holType, setHolType] = useState<string>('')

  // ── Company config form ─────────────────────────────────────────
  const [companyForm, setCompanyForm] = useState<Record<string, string>>({})

  const [saving, setSaving] = useState(false)

  // ── Fetch all config ────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch('/api/config?type=all')
      if (!res.ok) throw new Error()
      const data = await res.json()

      setCategories(data.categories ?? [])
      setSurcharges(data.surcharges ?? [])
      setHolidays(data.holidays ?? [])
      setAppConfig(data.appConfig ?? {})
      setUsers(data.users ?? [])
      setLaborRules(data.laborRules ?? [])

      // Set the first labor rule for the store (used by calculation engine)
      if (data.laborRules && data.laborRules.length > 0) {
        setLaborRule(data.laborRules[0])
      } else {
        setLaborRule(null)
      }

      // Init company form from appConfig
      const cf: Record<string, string> = {}
      for (const f of COMPANY_FIELDS) {
        cf[f.key] = data.appConfig?.[f.key] ?? ''
      }
      setCompanyForm(cf)
    } catch {
      toast({ title: 'Error', description: 'No se pudo cargar la configuración', variant: 'destructive' })
    }
  }, [setCategories, setSurcharges, setHolidays, setAppConfig, setLaborRule, setUsers, setLaborRules, toast])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ── Refresh helpers ─────────────────────────────────────────────
  const refreshCategories = async () => {
    const res = await fetch('/api/config?type=categories&all=true')
    const data = await res.json()
    setCategories(data)
  }

  const refreshSurcharges = async () => {
    const res = await fetch('/api/config?type=surcharges&all=true')
    const data = await res.json()
    setSurcharges(data)
  }

  const refreshHolidays = async () => {
    const res = await fetch('/api/config?type=holidays')
    const data = await res.json()
    setHolidays(data)
  }

  const refreshUsers = async () => {
    const res = await fetch('/api/config?type=users')
    const data = await res.json()
    setUsers(data)
  }

  const refreshLaborRules = async () => {
    const res = await fetch('/api/config?type=laborRules')
    const data = await res.json()
    setLaborRules(data)
    if (data.length > 0) setLaborRule(data[0])
    else setLaborRule(null)
  }

  // ═════════════════════════════════════════════════════════════════
  //  TAB 1 — CATEGORÍAS PROFESIONALES
  // ═════════════════════════════════════════════════════════════════

  const openNewCategory = () => {
    setCatForm({ name: '', description: '', defaultPricePerHour: 0, defaultInternalCost: 0, active: true })
    setCatEditing(false)
    setCatDialogOpen(true)
  }

  const openEditCategory = (c: CategoryRow) => {
    setCatForm({ ...c })
    setCatEditing(true)
    setCatDialogOpen(true)
  }

  const saveCategory = async () => {
    if (!catForm.name || catForm.defaultPricePerHour === undefined) {
      toast({ title: 'Error', description: 'Nombre y precio por hora son obligatorios', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const method = catEditing ? 'PUT' : 'POST'
      const res = await fetch('/api/config?type=category', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(catForm),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      toast({ title: catEditing ? 'Categoría actualizada' : 'Categoría creada', description: catForm.name })
      setCatDialogOpen(false)
      refreshCategories()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const deleteCategory = async (c: CategoryRow) => {
    if (!confirm(`¿Eliminar la categoría "${c.name}"?`)) return
    try {
      const res = await fetch(`/api/config?type=category&id=${c.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al eliminar')
      }
      toast({ title: 'Categoría eliminada', description: c.name })
      refreshCategories()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  // ═════════════════════════════════════════════════════════════════
  //  TAB 2 — RECARGOS
  // ═════════════════════════════════════════════════════════════════

  const openNewSurcharge = () => {
    setSurForm({ name: '', type: 'nocturnidad', surchargeType: 'percentage', value: 0, description: '', active: true })
    setSurEditing(false)
    setSurDialogOpen(true)
  }

  const openEditSurcharge = (s: SurchargeConfigDTO) => {
    setSurForm({ ...s })
    setSurEditing(true)
    setSurDialogOpen(true)
  }

  const saveSurcharge = async () => {
    if (!surForm.name || !surForm.type || !surForm.surchargeType || surForm.value === undefined) {
      toast({ title: 'Error', description: 'Nombre, tipo, modo y valor son obligatorios', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const method = surEditing ? 'PUT' : 'POST'
      const res = await fetch('/api/config?type=surcharge', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(surForm),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      toast({ title: surEditing ? 'Recargo actualizado' : 'Recargo creado', description: surForm.name })
      setSurDialogOpen(false)
      refreshSurcharges()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const deleteSurcharge = async (s: SurchargeConfigDTO) => {
    if (!s.id) return
    if (!confirm(`¿Eliminar el recargo "${s.name}"?`)) return
    try {
      const res = await fetch(`/api/config?type=surcharge&id=${s.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al eliminar')
      }
      toast({ title: 'Recargo eliminado', description: s.name })
      refreshSurcharges()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  const surchargeKindLabel = (k: string) =>
    SURCHARGE_KIND_OPTIONS.find((o) => o.value === k)?.label ?? k

  // ═════════════════════════════════════════════════════════════════
  //  TAB 3 — FESTIVOS
  // ═════════════════════════════════════════════════════════════════

  const filteredHolidays = holidays.filter((h) => {
    if (holYear) {
      const hYear = h.date?.substring(0, 4)
      if (hYear !== holYear) return false
    }
    if (holType && h.type !== holType) return false
    return true
  })

  const openNewHoliday = () => {
    setHolForm({ date: '', name: '', type: 'nacional', autonomousCommunity: '', province: '' })
    setHolDialogOpen(true)
  }

  const saveHoliday = async () => {
    if (!holForm.date || !holForm.name || !holForm.type) {
      toast({ title: 'Error', description: 'Fecha, nombre y tipo son obligatorios', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/config?type=holiday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holForm),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      toast({ title: 'Festivo creado', description: holForm.name })
      setHolDialogOpen(false)
      refreshHolidays()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const deleteHoliday = async (h: HolidayInfo & { id?: string }) => {
    if (!h.id) return
    if (!confirm(`¿Eliminar el festivo "${h.name}" (${h.date})?`)) return
    try {
      const res = await fetch(`/api/config?type=holiday&id=${h.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al eliminar')
      }
      toast({ title: 'Festivo eliminado', description: h.name })
      refreshHolidays()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  // ═════════════════════════════════════════════════════════════════
  //  TAB 4 — REGLAS LABORALES
  // ═════════════════════════════════════════════════════════════════

  const openEditRule = (r: LaborRuleDTO) => {
    setRuleForm({ ...r })
    setRuleDialogOpen(true)
  }

  const saveRule = async () => {
    if (!ruleForm.id) return
    setSaving(true)
    try {
      const res = await fetch('/api/config?type=laborRule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleForm),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      toast({ title: 'Regla laboral actualizada', description: ruleForm.name })
      setRuleDialogOpen(false)
      refreshLaborRules()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ═════════════════════════════════════════════════════════════════
  //  TAB 5 — USUARIOS
  // ═════════════════════════════════════════════════════════════════

  const openNewUser = () => {
    setUserForm({ name: '', email: '', role: 'comercial' })
    setUserDialogOpen(true)
  }

  const saveUser = async () => {
    if (!userForm.name || !userForm.email || !userForm.role) {
      toast({ title: 'Error', description: 'Nombre, email y rol son obligatorios', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/config?type=user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userForm),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      toast({ title: 'Usuario creado', description: userForm.name })
      setUserDialogOpen(false)
      refreshUsers()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const toggleUserActive = async (u: UserRow) => {
    try {
      const res = await fetch('/api/config?type=user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, active: !u.active }),
      })
      if (!res.ok) throw new Error()
      refreshUsers()
    } catch {
      toast({ title: 'Error', description: 'No se pudo cambiar el estado del usuario', variant: 'destructive' })
    }
  }

  const deleteUser = async (u: UserRow) => {
    if (!confirm(`¿Desactivar al usuario "${u.name}"?`)) return
    try {
      const res = await fetch(`/api/config?type=user&id=${u.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast({ title: 'Usuario desactivado', description: u.name })
      refreshUsers()
    } catch {
      toast({ title: 'Error', description: 'No se pudo desactivar el usuario', variant: 'destructive' })
    }
  }

  // ═════════════════════════════════════════════════════════════════
  //  TAB 6 — CONFIGURACIÓN EMPRESA
  // ═════════════════════════════════════════════════════════════════

  const [companySaving, setCompanySaving] = useState(false)

  const saveCompanyConfig = async () => {
    setCompanySaving(true)
    try {
      await Promise.all(
        COMPANY_FIELDS.map((f) =>
          fetch('/api/config?type=appConfig', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: f.key, value: companyForm[f.key] ?? '' }),
          })
        )
      )
      // Refresh appConfig in store
      const res = await fetch('/api/config?type=appConfig')
      const kv = await res.json()
      setAppConfig(kv)

      toast({ title: 'Configuración guardada', description: 'Los datos de la empresa se han actualizado' })
    } catch {
      toast({ title: 'Error', description: 'No se pudo guardar la configuración', variant: 'destructive' })
    } finally {
      setCompanySaving(false)
    }
  }

  // ═════════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Panel de Administración</h1>
      </div>

      <Tabs defaultValue="categorias" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="categorias">Categorías Profesionales</TabsTrigger>
          <TabsTrigger value="recargos">Recargos</TabsTrigger>
          <TabsTrigger value="festivos">Festivos</TabsTrigger>
          <TabsTrigger value="reglas">Reglas Laborales</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="empresa">Configuración Empresa</TabsTrigger>
          <TabsTrigger value="remota">Config. Remota</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
          <TabsTrigger value="registro_legal">Registro Legal</TabsTrigger>
          <TabsTrigger value="parametros_legales">Parámetros Legales</TabsTrigger>
          <TabsTrigger value="branding" className={isMaestro ? '' : 'hidden'}>Branding / Licencia</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1 — CATEGORÍAS ══════════════════════════════════ */}
        <TabsContent value="categorias" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Categorías Profesionales</h2>
            <Button onClick={openNewCategory}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Categoría
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-right">Precio/hora Venta</TableHead>
                      <TableHead className="text-right">Coste/hora Interno</TableHead>
                      <TableHead>Activo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(categories as unknown as CategoryRow[]).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No hay categorías configuradas.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (categories as unknown as CategoryRow[]).map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right">{c.defaultPricePerHour.toFixed(2)} €</TableCell>
                          <TableCell className="text-right">
                            {c.defaultInternalCost != null ? `${c.defaultInternalCost.toFixed(2)} €` : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.active ? 'default' : 'secondary'}>
                              {c.active ? 'Sí' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditCategory(c)} title="Editar">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteCategory(c)}
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
        </TabsContent>

        {/* ═══ TAB 2 — RECARGOS ════════════════════════════════════ */}
        <TabsContent value="recargos" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recargos</h2>
            <Button onClick={openNewSurcharge}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Recargo
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Modo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Activo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {surcharges.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          No hay recargos configurados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      surcharges.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {SURCHARGE_TYPE_OPTIONS.find((o) => o.value === s.type)?.label ?? s.type}
                            </Badge>
                          </TableCell>
                          <TableCell>{surchargeKindLabel(s.surchargeType)}</TableCell>
                          <TableCell className="text-right">{s.value}</TableCell>
                          <TableCell>
                            <Badge variant={s.active ? 'default' : 'secondary'}>
                              {s.active ? 'Sí' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditSurcharge(s)} title="Editar">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteSurcharge(s)}
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
        </TabsContent>

        {/* ═══ TAB 3 — FESTIVOS ════════════════════════════════════ */}
        <TabsContent value="festivos" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Festivos</h2>
            <Button onClick={openNewHoliday}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Festivo
            </Button>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-end gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="holYear">Año</Label>
                  <Input
                    id="holYear"
                    type="number"
                    value={holYear}
                    onChange={(e) => setHolYear(e.target.value)}
                    className="w-28"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="holType">Tipo</Label>
                  <Select value={holType} onValueChange={setHolType}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {HOLIDAY_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Comunidad</TableHead>
                      <TableHead>Provincia</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHolidays.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          No se encontraron festivos.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredHolidays.map((h, i) => (
                        <TableRow key={(h as any).id ?? i}>
                          <TableCell className="font-medium">{h.date}</TableCell>
                          <TableCell>{h.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{h.type}</Badge>
                          </TableCell>
                          <TableCell>{h.autonomousCommunity ?? '—'}</TableCell>
                          <TableCell>{h.province ?? '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteHoliday(h as any)}
                              title="Eliminar"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 4 — REGLAS LABORALES ════════════════════════════ */}
        <TabsContent value="reglas" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Reglas Laborales</h2>
          </div>

          {laborRules.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No hay reglas laborales configuradas. Cree una desde el seed o la API.
              </CardContent>
            </Card>
          ) : (
            laborRules.map((r) => (
              <Card key={r.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">{r.name}</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => openEditRule(r)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-3">
                    <div>
                      <span className="text-muted-foreground">Máx. horas semanales:</span>{' '}
                      <span className="font-medium">{r.maxWeeklyHours} h</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Máx. horas diarias:</span>{' '}
                      <span className="font-medium">{r.maxDailyHours} h</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Descanso entre turnos:</span>{' '}
                      <span className="font-medium">{r.minRestBetweenShiftsH} h</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Máx. días consecutivos:</span>{' '}
                      <span className="font-medium">{r.maxConsecutiveDays}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Hora inicio nocturno:</span>{' '}
                      <span className="font-medium">{r.nightStartHour}:00</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Hora fin nocturno:</span>{' '}
                      <span className="font-medium">{r.nightEndHour}:00</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ═══ TAB 5 — USUARIOS ════════════════════════════════════ */}
        <TabsContent value="usuarios" className="space-y-4">
          <UsersPanel />
        </TabsContent>

        {/* ═══ TAB 6 — CONFIGURACIÓN EMPRESA ═══════════════════════ */}
        <TabsContent value="empresa" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Configuración de la Empresa</h2>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4">
                {COMPANY_FIELDS.map((f) => (
                  <div key={f.key} className="grid gap-2">
                    <Label htmlFor={f.key}>{f.label}</Label>
                    <Input
                      id={f.key}
                      value={companyForm[f.key] ?? ''}
                      onChange={(e) =>
                        setCompanyForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                      }
                      placeholder={f.label}
                    />
                  </div>
                ))}
              </div>
              <Separator className="my-6" />
              <div className="flex justify-end">
                <Button onClick={saveCompanyConfig} disabled={companySaving}>
                  {companySaving ? 'Guardando...' : 'Guardar configuración'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 7 — CONFIGURACIÓN REMOTA ═══════════════════════ */}
        <TabsContent value="remota" className="space-y-4">
          <RemoteConfigPanel />
        </TabsContent>
        <TabsContent value="auditoria" className="space-y-4">
          <AdminAuditPanel />
        </TabsContent>

        <TabsContent value="registro_legal" className="space-y-4">
          <LegalRecordsPanel />
        </TabsContent>
        <TabsContent value="parametros_legales" className="space-y-4">
          <LegalParametersPanel />
        </TabsContent>

        <TabsContent value="branding" className={isMaestro ? 'space-y-4' : 'hidden'}>
          <BrandingPanel />
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════════════════════════
          DIALOGS
         ════════════════════════════════════════════════════════════ */}

      {/* ── Category Dialog ───────────────────────────────────────── */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{catEditing ? 'Editar Categoría' : 'Nueva Categoría'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nombre *</Label>
              <Input
                value={catForm.name ?? ''}
                onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Enfermero DUE"
              />
            </div>
            <div className="grid gap-2">
              <Label>Descripción</Label>
              <Textarea
                value={catForm.description ?? ''}
                onChange={(e) => setCatForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Descripción de la categoría"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Precio/hora Venta (€) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={catForm.defaultPricePerHour ?? 0}
                  onChange={(e) =>
                    setCatForm((p) => ({ ...p, defaultPricePerHour: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Coste/hora Interno (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={catForm.defaultInternalCost ?? 0}
                  onChange={(e) =>
                    setCatForm((p) => ({ ...p, defaultInternalCost: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={catForm.active ?? true}
                onCheckedChange={(v) => setCatForm((p) => ({ ...p, active: v }))}
              />
              <Label>Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveCategory} disabled={saving}>
              {saving ? 'Guardando...' : catEditing ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Surcharge Dialog ──────────────────────────────────────── */}
      <Dialog open={surDialogOpen} onOpenChange={setSurDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{surEditing ? 'Editar Recargo' : 'Nuevo Recargo'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nombre *</Label>
              <Input
                value={surForm.name ?? ''}
                onChange={(e) => setSurForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Recargo nocturnidad"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Tipo *</Label>
                <Select
                  value={surForm.type ?? 'nocturnidad'}
                  onValueChange={(v) => setSurForm((p) => ({ ...p, type: v as SurchargeType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SURCHARGE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Modo *</Label>
                <Select
                  value={surForm.surchargeType ?? 'percentage'}
                  onValueChange={(v) => setSurForm((p) => ({ ...p, surchargeType: v as SurchargeKind }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SURCHARGE_KIND_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Valor *</Label>
              <Input
                type="number"
                step="0.01"
                value={surForm.value ?? 0}
                onChange={(e) =>
                  setSurForm((p) => ({ ...p, value: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Descripción</Label>
              <Textarea
                value={surForm.description ?? ''}
                onChange={(e) => setSurForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Descripción del recargo"
                rows={2}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={surForm.active ?? true}
                onCheckedChange={(v) => setSurForm((p) => ({ ...p, active: v }))}
              />
              <Label>Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSurDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveSurcharge} disabled={saving}>
              {saving ? 'Guardando...' : surEditing ? 'Guardar cambios' : 'Crear recargo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Holiday Dialog ────────────────────────────────────────── */}
      <Dialog open={holDialogOpen} onOpenChange={setHolDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Festivo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fecha *</Label>
                <Input
                  type="date"
                  value={holForm.date ?? ''}
                  onChange={(e) => setHolForm((p) => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Tipo *</Label>
                <Select
                  value={holForm.type ?? 'nacional'}
                  onValueChange={(v) => setHolForm((p) => ({ ...p, type: v as HolidayType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOLIDAY_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Nombre *</Label>
              <Input
                value={holForm.name ?? ''}
                onChange={(e) => setHolForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Día de la Constitución"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Comunidad Autónoma</Label>
                <Input
                  value={holForm.autonomousCommunity ?? ''}
                  onChange={(e) => setHolForm((p) => ({ ...p, autonomousCommunity: e.target.value }))}
                  placeholder="Ej: Comunidad de Madrid"
                />
              </div>
              <div className="grid gap-2">
                <Label>Provincia</Label>
                <Input
                  value={holForm.province ?? ''}
                  onChange={(e) => setHolForm((p) => ({ ...p, province: e.target.value }))}
                  placeholder="Ej: Madrid"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHolDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveHoliday} disabled={saving}>
              {saving ? 'Guardando...' : 'Crear festivo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Labor Rule Dialog ─────────────────────────────────────── */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Regla Laboral</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nombre</Label>
              <Input
                value={ruleForm.name ?? ''}
                onChange={(e) => setRuleForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Máx. horas semanales</Label>
                <Input
                  type="number"
                  value={ruleForm.maxWeeklyHours ?? 40}
                  onChange={(e) =>
                    setRuleForm((p) => ({ ...p, maxWeeklyHours: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Máx. horas diarias</Label>
                <Input
                  type="number"
                  value={ruleForm.maxDailyHours ?? 12}
                  onChange={(e) =>
                    setRuleForm((p) => ({ ...p, maxDailyHours: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Descanso entre turnos (h)</Label>
                <Input
                  type="number"
                  value={ruleForm.minRestBetweenShiftsH ?? 11}
                  onChange={(e) =>
                    setRuleForm((p) => ({ ...p, minRestBetweenShiftsH: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Máx. días consecutivos</Label>
                <Input
                  type="number"
                  value={ruleForm.maxConsecutiveDays ?? 6}
                  onChange={(e) =>
                    setRuleForm((p) => ({ ...p, maxConsecutiveDays: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Hora inicio nocturno</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={ruleForm.nightStartHour ?? 22}
                  onChange={(e) =>
                    setRuleForm((p) => ({ ...p, nightStartHour: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Hora fin nocturno</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={ruleForm.nightEndHour ?? 6}
                  onChange={(e) =>
                    setRuleForm((p) => ({ ...p, nightEndHour: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveRule} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── User Dialog ───────────────────────────────────────────── */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Usuario</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nombre *</Label>
              <Input
                value={userForm.name ?? ''}
                onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Nombre completo"
              />
            </div>
            <div className="grid gap-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={userForm.email ?? ''}
                onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="correo@empresa.com"
              />
            </div>
            <div className="grid gap-2">
              <Label>Rol *</Label>
              <Select
                value={userForm.role ?? 'comercial'}
                onValueChange={(v) => setUserForm((p) => ({ ...p, role: v as UserRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveUser} disabled={saving}>
              {saving ? 'Guardando...' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}