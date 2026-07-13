'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { LegalBadgeButton } from '@/components/legal/legal-badge-button';
import { LegalRecordDrawer, type LegalRecordData } from '@/components/legal/legal-record-drawer';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LegalRecordSummary {
  id: string;
  key?: string | null;
  title: string;
  reference?: string | null;
  norm?: string | null;
  location?: string | null;
  eliUrl?: string | null;
  officialUrl?: string | null;
  status?: string | null;
  category?: string | null;
  hasLiteralQuote?: boolean;
  literalQuote?: string | null;
  quoteSource?: string | null;
  operativeSummary?: string | null;
  reviewDate?: string | null;
}

interface LegalParameter {
  id: string;
  key: string;
  label: string;
  value: string;
  unit?: string | null;
  category: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive: boolean;
  notes?: string | null;
  legalRecordId?: string | null;
  legalRecord?: LegalRecordSummary | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface LegalParameterFormData {
  key: string;
  label: string;
  value: string;
  unit: string;
  category: string;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
  notes: string;
  legalRecordId: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORIES: Record<string, string> = {
  'Salario mínimo': 'Salario mínimo',
  'Seguridad Social empresa': 'Seguridad Social empresa',
  'IVA': 'IVA',
  'Convenios': 'Convenios',
};

const EMPTY_FORM: LegalParameterFormData = {
  key: '',
  label: '',
  value: '',
  unit: '',
  category: '',
  effectiveFrom: '',
  effectiveTo: '',
  isActive: true,
  notes: '',
  legalRecordId: '',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LegalParametersPanel() {
  /* ---- Data state ---- */
  const [parameters, setParameters] = useState<LegalParameter[]>([]);
  const [legalRecords, setLegalRecords] = useState<LegalRecordSummary[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---- Filters ---- */
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  /* ---- Legal record drawer ---- */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRecord, setDrawerRecord] = useState<LegalRecordData | null>(null);

  /* ---- Create / Edit dialog ---- */
  const [formOpen, setFormOpen] = useState(false);
  const [editingParam, setEditingParam] = useState<LegalParameter | null>(null);
  const [form, setForm] = useState<LegalParameterFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  /* ---- Delete confirmation ---- */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingParam, setDeletingParam] = useState<LegalParameter | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Fetch parameters                                                 */
  /* ---------------------------------------------------------------- */

  const fetchParameters = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        categoryFilter !== 'all'
          ? `/api/legal-parameters?category=${categoryFilter}`
          : '/api/legal-parameters';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Error al cargar parámetros');
      const data = await res.json();
      setParameters(Array.isArray(data) ? data : data.parameters ?? []);
    } catch {
      toast.error('Error al cargar parámetros legales');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  /* ---------------------------------------------------------------- */
  /*  Fetch legal records (for dropdown)                               */
  /* ---------------------------------------------------------------- */

  const fetchLegalRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/legal-records');
      if (!res.ok) return;
      const data = await res.json();
      const list: LegalRecordSummary[] = Array.isArray(data)
        ? data.map((r: LegalRecordSummary) => ({
            id: r.id,
            key: r.key,
            title: r.title,
            reference: r.reference,
            norm: r.norm,
            location: r.location,
            status: r.status,
            category: r.category,
            eliUrl: r.eliUrl,
            officialUrl: r.officialUrl,
            hasLiteralQuote: r.hasLiteralQuote,
            literalQuote: (r as Record<string, unknown>).literalQuote as string | undefined,
            quoteSource: (r as Record<string, unknown>).quoteSource as string | undefined,
            operativeSummary: r.operativeSummary,
            reviewDate: r.reviewDate,
          }))
        : (data.records ?? []).map((r: LegalRecordSummary) => ({
            id: r.id,
            key: r.key,
            title: r.title,
            reference: r.reference,
            norm: r.norm,
            location: r.location,
            status: r.status,
            category: r.category,
            eliUrl: r.eliUrl,
            officialUrl: r.officialUrl,
            hasLiteralQuote: r.hasLiteralQuote,
            literalQuote: (r as Record<string, unknown>).literalQuote as string | undefined,
            quoteSource: (r as Record<string, unknown>).quoteSource as string | undefined,
            operativeSummary: r.operativeSummary,
            reviewDate: r.reviewDate,
          }));
      setLegalRecords(list);
    } catch {
      /* silently ignore — dropdown will just be empty */
    }
  }, []);

  useEffect(() => {
    fetchParameters();
    fetchLegalRecords();
  }, [fetchParameters, fetchLegalRecords]);

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */

  function updateForm(field: keyof LegalParameterFormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  /* ---------------------------------------------------------------- */
  /*  Create / Edit                                                    */
  /* ---------------------------------------------------------------- */

  function openCreate() {
    setEditingParam(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(param: LegalParameter) {
    setEditingParam(param);
    setForm({
      key: param.key,
      label: param.label,
      value: param.value,
      unit: param.unit ?? '',
      category: param.category,
      effectiveFrom: param.effectiveFrom ?? '',
      effectiveTo: param.effectiveTo ?? '',
      isActive: param.isActive,
      notes: param.notes ?? '',
      legalRecordId: param.legalRecordId ?? '',
    });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.key.trim() || !form.label.trim() || !form.value.trim() || !form.category) {
      toast.error('Clave, etiqueta, valor y categoría son obligatorios');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        key: form.key.trim(),
        label: form.label.trim(),
        value: form.value.trim(),
        unit: form.unit.trim() || null,
        category: form.category,
        effectiveFrom: form.effectiveFrom || null,
        effectiveTo: form.effectiveTo || null,
        isActive: form.isActive,
        notes: form.notes.trim() || null,
        legalRecordId: form.legalRecordId || null,
      };

      const isEditing = !!editingParam;
      const method = isEditing ? 'PUT' : 'POST';

      if (isEditing) {
        payload.id = editingParam.id;
      }

      const res = await fetch('/api/legal-parameters', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Error al ${isEditing ? 'actualizar' : 'crear'} parámetro`);
      }

      toast.success(isEditing ? 'Parámetro actualizado' : 'Parámetro creado');
      setFormOpen(false);
      fetchParameters();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Delete                                                           */
  /* ---------------------------------------------------------------- */

  function confirmDelete(param: LegalParameter) {
    setDeletingParam(param);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deletingParam) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/legal-parameters', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingParam.id }),
      });
      if (!res.ok) throw new Error('Error al eliminar parámetro');
      toast.success('Parámetro eliminado');
      setDeleteOpen(false);
      fetchParameters();
    } catch {
      toast.error('Error al eliminar parámetro');
    } finally {
      setDeleting(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Legal record drawer                                              */
  /* ---------------------------------------------------------------- */

  async function openRecordDrawer(param: LegalParameter) {
    // First try from the included legalRecord
    if (param.legalRecord) {
      setDrawerRecord(param.legalRecord as unknown as LegalRecordData);
      setDrawerOpen(true);
      return;
    }

    // If we have legalRecordId but no full data, try to find in our local list
    if (param.legalRecordId) {
      const found = legalRecords.find((r) => r.id === param.legalRecordId);
      if (found) {
        setDrawerRecord(found as unknown as LegalRecordData);
        setDrawerOpen(true);
        return;
      }
    }

    // Fallback: try the API (supports ?id= query param or we just use our list)
    if (param.legalRecordId) {
      setDrawerRecord(null);
      setDrawerOpen(true);
      try {
        const res = await fetch('/api/legal-records');
        if (!res.ok) throw new Error();
        const data = await res.json();
        const list = Array.isArray(data) ? data : [data];
        const record = list.find((r: { id: string }) => r.id === param.legalRecordId);
        if (record) {
          setDrawerRecord(record as unknown as LegalRecordData);
        }
      } catch {
        toast.error('No se pudo cargar la ficha legal');
        setDrawerOpen(false);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  function getFilteredParameters() {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return parameters;
    return parameters.filter(
      (p) =>
        p.key.toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q) ||
        p.value.toLowerCase().includes(q) ||
        p.unit?.toLowerCase().includes(q)
    );
  }

  const filtered = getFilteredParameters();

  return (
    <div className="space-y-4">
      {/* Header & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar parámetro..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48 h-9">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {Object.entries(CATEGORIES).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openCreate} size="sm" className="shrink-0">
          <Plus className="size-4 mr-1.5" />
          Añadir parámetro
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[130px]">Clave</TableHead>
                  <TableHead className="min-w-[150px]">Etiqueta</TableHead>
                  <TableHead className="min-w-[120px]">Valor</TableHead>
                  <TableHead className="min-w-[70px]">Unidad</TableHead>
                  <TableHead className="min-w-[140px]">Categoría</TableHead>
                  <TableHead className="w-10" />
                  <TableHead className="w-20 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Cargando parámetros...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      {searchQuery || categoryFilter !== 'all'
                        ? 'No se encontraron parámetros con los filtros aplicados'
                        : 'No hay parámetros registrados'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((param) => (
                    <TableRow key={param.id}>
                      <TableCell className="font-mono text-xs">{param.key}</TableCell>
                      <TableCell>
                        <span className="font-medium">{param.label}</span>
                        {/* LegalBadgeButton inline */}
                        {(param.legalRecord || param.legalRecordId) && (
                          <LegalBadgeButton
                            onClick={() => openRecordDrawer(param)}
                            title="Ver soporte legal"
                          />
                        )}
                      </TableCell>
                      <TableCell>{param.value}</TableCell>
                      <TableCell className="text-muted-foreground">{param.unit ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {CATEGORIES[param.category] ?? param.category}
                        </Badge>
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => openEdit(param)}
                            title="Editar"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => confirmDelete(param)}
                            title="Eliminar"
                          >
                            <Trash2 className="size-3.5" />
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

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingParam ? 'Editar parámetro' : 'Nuevo parámetro'}
            </DialogTitle>
            <DialogDescription>
              {editingParam
                ? 'Modifica los campos del parámetro legal.'
                : 'Rellena los datos para crear un nuevo parámetro legal.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Key */}
            <div className="grid gap-1.5">
              <Label htmlFor="param-key">Clave <span className="text-red-500">*</span></Label>
              <Input
                id="param-key"
                placeholder="ej: SMI_MONTHLY_2026"
                value={form.key}
                onChange={(e) => updateForm('key', e.target.value)}
                readOnly={!!editingParam}
                className={editingParam ? 'bg-muted cursor-not-allowed' : ''}
              />
            </div>

            {/* Label */}
            <div className="grid gap-1.5">
              <Label htmlFor="param-label">Etiqueta <span className="text-red-500">*</span></Label>
              <Input
                id="param-label"
                placeholder="ej: SMI mensual 2026"
                value={form.label}
                onChange={(e) => updateForm('label', e.target.value)}
              />
            </div>

            {/* Value + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="param-value">Valor <span className="text-red-500">*</span></Label>
                <Input
                  id="param-value"
                  placeholder="ej: 1221"
                  value={form.value}
                  onChange={(e) => updateForm('value', e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="param-unit">Unidad</Label>
                <Input
                  id="param-unit"
                  placeholder="ej: €/mes"
                  value={form.unit}
                  onChange={(e) => updateForm('unit', e.target.value)}
                />
              </div>
            </div>

            {/* Category */}
            <div className="grid gap-1.5">
              <Label>Categoría <span className="text-red-500">*</span></Label>
              <Select value={form.category} onValueChange={(v) => updateForm('category', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="param-from">Vigencia desde</Label>
                <Input id="param-from" type="date" value={form.effectiveFrom} onChange={(e) => updateForm('effectiveFrom', e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="param-to">Vigencia hasta</Label>
                <Input id="param-to" type="date" value={form.effectiveTo} onChange={(e) => updateForm('effectiveTo', e.target.value)} />
              </div>
            </div>

            {/* Active */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="param-active"
                checked={form.isActive}
                onCheckedChange={(checked) => updateForm('isActive', checked === true)}
              />
              <Label htmlFor="param-active" className="cursor-pointer">Parámetro activo</Label>
            </div>

            {/* Legal Record */}
            <div className="grid gap-1.5">
              <Label>Ficha legal vinculada</Label>
              <Select value={form.legalRecordId} onValueChange={(v) => updateForm('legalRecordId', v)}>
                <SelectTrigger><SelectValue placeholder="Sin vinculación" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin vinculación</SelectItem>
                  {legalRecords.map((record) => (
                    <SelectItem key={record.id} value={record.id}>
                      {record.reference ? `${record.reference} — ${record.title}` : record.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="grid gap-1.5">
              <Label htmlFor="param-notes">Notas</Label>
              <Textarea
                id="param-notes"
                placeholder="Observaciones internas..."
                value={form.notes}
                onChange={(e) => updateForm('notes', e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingParam ? 'Guardar cambios' : 'Crear parámetro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar parámetro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se desactivará el parámetro <strong>{deletingParam?.label}</strong> (
              <span className="font-mono">{deletingParam?.key}</span>). Esta acción se puede
              deshacer más tarde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Legal Record Drawer */}
      <LegalRecordDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        record={drawerRecord}
      />
    </div>
  );
}