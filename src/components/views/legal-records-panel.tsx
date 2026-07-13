'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Scale,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Search,
  AlertTriangle,
  FileText,
  Archive,
} from 'lucide-react';
import { toast } from 'sonner';
import { LegalRecordDrawer, type LegalRecordData } from '@/components/legal/legal-record-drawer';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LegalRecord {
  id: string;
  key?: string | null;
  title: string;
  category: string;
  norm: string;
  location?: string | null;
  reference?: string | null;
  eliUrl?: string | null;
  officialUrl?: string | null;
  hasLiteralQuote: boolean;
  literalQuote?: string | null;
  quoteSource?: string | null;
  operativeSummary?: string | null;
  status: string;
  sourceType: string;
  reviewDate?: string | null;
  internalNotes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface LegalRecordFormData {
  title: string;
  category: string;
  norm: string;
  location: string;
  reference: string;
  eliUrl: string;
  officialUrl: string;
  hasLiteralQuote: boolean;
  literalQuote: string;
  quoteSource: string;
  operativeSummary: string;
  status: string;
  sourceType: string;
  reviewDate: string;
  internalNotes: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORIES: Record<string, string> = {
  'Salario mínimo': 'Salario mínimo',
  'Cotización SS 2026': 'Cotización SS 2026',
  'IVA': 'IVA',
  'Contratos': 'Contratos',
  'Comercial': 'Comercial',
  'Convenios salariales': 'Convenios salariales',
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  vigente: {
    label: 'Vigente',
    className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/25 hover:bg-emerald-500/25',
  },
  derogado: {
    label: 'Derogado',
    className: 'bg-red-500/15 text-red-700 border-red-500/25 hover:bg-red-500/25',
  },
  pendiente_revision: {
    label: 'Pendiente',
    className: 'bg-amber-500/15 text-amber-700 border-amber-500/25 hover:bg-amber-500/25',
  },
  validar_con_asesoria: {
    label: 'Validar con asesoría',
    className: 'bg-orange-500/15 text-orange-700 border-orange-500/25 hover:bg-orange-500/25',
  },
  orientativo: {
    label: 'Orientativo',
    className: 'bg-blue-500/15 text-blue-700 border-blue-500/25 hover:bg-blue-500/25',
  },
};

const SOURCE_TYPES: Record<string, string> = {
  boe: 'BOE',
  boletin_autonomico: 'Boletín Autonómico',
  convenio: 'Convenio',
  interno: 'Interno',
  otro: 'Otro',
};

const EMPTY_FORM: LegalRecordFormData = {
  title: '',
  category: '',
  norm: '',
  location: '',
  reference: '',
  eliUrl: '',
  officialUrl: '',
  hasLiteralQuote: false,
  literalQuote: '',
  quoteSource: '',
  operativeSummary: '',
  status: 'vigente',
  sourceType: '',
  reviewDate: '',
  internalNotes: '',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LegalRecordsPanel() {
  /* ---- Data state ---- */
  const [records, setRecords] = useState<LegalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---- Filters ---- */
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  /* ---- Drawer ---- */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRecord, setDrawerRecord] = useState<LegalRecordData | null>(null);

  /* ---- Create / Edit dialog ---- */
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LegalRecord | null>(null);
  const [form, setForm] = useState<LegalRecordFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  /* ---- Archive confirmation ---- */
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivingRecord, setArchivingRecord] = useState<LegalRecord | null>(null);
  const [archiving, setArchiving] = useState(false);

  /* ---- Delete confirmation ---- */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<LegalRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Fetch records                                                     */
  /* ---------------------------------------------------------------- */

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/legal-records');
      if (!res.ok) throw new Error('Error al cargar fichas legales');
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : data.records ?? []);
    } catch {
      toast.error('Error al cargar fichas legales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */

  function statusBadge(status: string) {
    const cfg = STATUS_CONFIG[status] ?? {
      label: status,
      className: 'bg-gray-500/15 text-gray-600 border-gray-500/25',
    };
    return (
      <Badge variant="outline" className={cfg.className}>
        {cfg.label}
      </Badge>
    );
  }

  /* Filtered + grouped list */
  const groupedRecords = useMemo(() => {
    const filtered = records.filter((r) => {
      const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || r.title.toLowerCase().includes(q) || r.norm.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });

    const groups: Record<string, LegalRecord[]> = {};
    for (const r of filtered) {
      const cat = r.category || 'Otro';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(r);
    }
    return groups;
  }, [records, searchQuery, categoryFilter]);

  /* ---------------------------------------------------------------- */
  /*  Drawer                                                            */
  /* ---------------------------------------------------------------- */

  function openDrawer(record: LegalRecord) {
    setDrawerRecord(record as LegalRecordData);
    setDrawerOpen(true);
  }

  /* ---------------------------------------------------------------- */
  /*  Create / Edit dialog                                             */
  /* ---------------------------------------------------------------- */

  function openCreate() {
    setEditingRecord(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(record?: LegalRecordData) {
    const r = record || editingRecord;
    if (!r) return;
    setEditingRecord(r as LegalRecord);
    setDrawerOpen(false);
    setForm({
      title: r.title ?? '',
      category: r.category ?? '',
      norm: r.norm ?? '',
      location: r.location ?? '',
      reference: r.reference ?? '',
      eliUrl: (r as LegalRecord).eliUrl ?? '',
      officialUrl: r.officialUrl ?? '',
      hasLiteralQuote: r.hasLiteralQuote ?? false,
      literalQuote: r.literalQuote ?? '',
      quoteSource: (r as LegalRecord).quoteSource ?? '',
      operativeSummary: r.operativeSummary ?? '',
      status: r.status ?? 'vigente',
      sourceType: (r as LegalRecord).sourceType ?? '',
      reviewDate: r.reviewDate ? r.reviewDate.split('T')[0] : '',
      internalNotes: (r as LegalRecord).internalNotes ?? '',
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingRecord(null);
    setForm(EMPTY_FORM);
  }

  /* ---------------------------------------------------------------- */
  /*  Save (create / update)                                           */
  /* ---------------------------------------------------------------- */

  async function handleSave() {
    if (!form.title.trim() || !form.category || !form.norm.trim()) {
      toast.error('Título, categoría y norma son obligatorios');
      return;
    }

    setSaving(true);
    try {
      const isEdit = !!editingRecord;
      const method = isEdit ? 'PUT' : 'POST';

      const body: Record<string, unknown> = {
        title: form.title.trim(),
        category: form.category,
        norm: form.norm.trim(),
      };
      if (form.location.trim()) body.location = form.location.trim();
      if (form.reference.trim()) body.reference = form.reference.trim();
      if (form.eliUrl.trim()) body.eliUrl = form.eliUrl.trim();
      if (form.officialUrl.trim()) body.officialUrl = form.officialUrl.trim();
      body.hasLiteralQuote = form.hasLiteralQuote;
      if (form.literalQuote.trim()) body.literalQuote = form.literalQuote.trim();
      if (form.quoteSource.trim()) body.quoteSource = form.quoteSource.trim();
      if (form.operativeSummary.trim()) body.operativeSummary = form.operativeSummary.trim();
      if (form.status) body.status = form.status;
      if (form.sourceType) body.sourceType = form.sourceType;
      if (form.reviewDate) body.reviewDate = form.reviewDate;
      if (form.internalNotes.trim()) body.internalNotes = form.internalNotes.trim();
      if (editingRecord) body.id = editingRecord.id;

      const res = await fetch('/api/legal-records', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(err.error || 'Error al guardar ficha');
      }

      toast.success(isEdit ? 'Ficha actualizada' : 'Ficha creada');
      closeForm();
      fetchRecords();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar ficha');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Archive                                                           */
  /* ---------------------------------------------------------------- */

  function openArchive(record: LegalRecord) {
    setArchivingRecord(record);
    setArchiveOpen(true);
  }

  async function handleArchive() {
    if (!archivingRecord) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/legal-records?id=${archivingRecord.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(err.error || 'Error al archivar ficha');
      }
      toast.success('Ficha archivada');
      setArchiveOpen(false);
      setArchivingRecord(null);
      fetchRecords();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al archivar ficha');
    } finally {
      setArchiving(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  const categoryOrder = Object.keys(CATEGORIES);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          Fichas legales
        </CardTitle>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Añadir ficha
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Warning about cita literal */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            La etiqueta <strong>«cita literal»</strong> solo aparece cuando el texto es verbatim del BOE.
            Las fichas sin cita muestran solo la síntesis operativa interna.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por título o norma…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {Object.entries(CATEGORIES).map(([code, label]) => (
                <SelectItem key={code} value={code}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Grouped records */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p>Cargando fichas…</p>
          </div>
        ) : Object.keys(groupedRecords).length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p>
              {records.length === 0
                ? 'No hay fichas legales registradas.'
                : 'No se encontraron resultados.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6 max-h-[60vh] overflow-y-auto">
            {categoryOrder
              .filter((cat) => groupedRecords[cat])
              .concat(Object.keys(groupedRecords).filter((cat) => !categoryOrder.includes(cat)))
              .map((category) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {CATEGORIES[category] ?? category}
                  </h3>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[200px]">Título</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Referencia</TableHead>
                          <TableHead>Revisión</TableHead>
                          <TableHead className="w-10" />
                          <TableHead className="text-right w-[100px]">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedRecords[category].map((record) => (
                          <TableRow
                            key={record.id}
                            className="cursor-pointer"
                            onClick={() => openDrawer(record)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm">{record.title}</span>
                                {/* hasLiteralQuote badge: only when true AND literalQuote non-empty */}
                                {record.hasLiteralQuote && record.literalQuote && (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">
                                    <FileText className="w-2.5 h-2.5 mr-0.5" />
                                    verbatim
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{statusBadge(record.status)}</TableCell>
                            <TableCell className="text-muted-foreground text-xs font-mono max-w-[140px] truncate">
                              {record.reference || '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {record.reviewDate || '—'}
                            </TableCell>
                            <TableCell>
                              {record.officialUrl && (
                                <a
                                  href={record.officialUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-primary hover:underline"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  title="Editar"
                                  onClick={() => openEdit(record)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  title="Archivar"
                                  onClick={() => openArchive(record)}
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
          </div>
        )}
      </CardContent>

      {/* ---- Legal Record Drawer ---- */}
      <LegalRecordDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        record={drawerRecord}
        onEdit={(r) => openEdit(r)}
      />

      {/* ---- Create / Edit Dialog ---- */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRecord ? 'Editar ficha legal' : 'Nueva ficha legal'}
            </DialogTitle>
            <DialogDescription>
              {editingRecord
                ? 'Modifica los campos de la ficha legal.'
                : 'Completa los datos para crear una nueva ficha legal.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Title */}
            <div className="grid gap-2">
              <Label htmlFor="lr-title">Título <span className="text-destructive">*</span></Label>
              <Input id="lr-title" placeholder="Título de la ficha" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>

            {/* Category + Norm */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="lr-category">Categoría <span className="text-destructive">*</span></Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger id="lr-category"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIES).map(([code, label]) => (
                      <SelectItem key={code} value={code}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lr-norm">Norma <span className="text-destructive">*</span></Label>
                <Input id="lr-norm" placeholder="Ej. RD 126/2026" value={form.norm} onChange={(e) => setForm((f) => ({ ...f, norm: e.target.value }))} />
              </div>
            </div>

            {/* Location + Reference */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="lr-location">Ubicación</Label>
                <Input id="lr-location" placeholder="Ej. Art. 1" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lr-reference">Referencia</Label>
                <Input id="lr-reference" placeholder="Ej. BOE-A-2026-3815" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
              </div>
            </div>

            {/* ELI URL + Official URL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="lr-eli">URL ELI</Label>
                <Input id="lr-eli" placeholder="https://www.boe.es/eli/..." value={form.eliUrl} onChange={(e) => setForm((f) => ({ ...f, eliUrl: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lr-url">URL oficial</Label>
                <Input id="lr-url" placeholder="https://www.boe.es/..." value={form.officialUrl} onChange={(e) => setForm((f) => ({ ...f, officialUrl: e.target.value }))} />
              </div>
            </div>

            {/* Has Literal Quote */}
            <div className="flex items-start gap-3">
              <Checkbox id="lr-has-quote" checked={form.hasLiteralQuote} onCheckedChange={(checked) => setForm((f) => ({ ...f, hasLiteralQuote: checked === true }))} />
              <div className="space-y-1 leading-none">
                <Label htmlFor="lr-has-quote">Contiene cita literal (verbatim del BOE)</Label>
              </div>
            </div>

            {/* Literal Quote */}
            {form.hasLiteralQuote && (
              <div className="grid gap-2">
                <Label htmlFor="lr-quote">Cita literal</Label>
                <Textarea id="lr-quote" placeholder="Texto literal de la norma…" rows={4} value={form.literalQuote} onChange={(e) => setForm((f) => ({ ...f, literalQuote: e.target.value }))} />
              </div>
            )}

            {/* Quote Source */}
            {form.hasLiteralQuote && (
              <div className="grid gap-2">
                <Label htmlFor="lr-quote-src">Fuente de la cita</Label>
                <Input id="lr-quote-src" placeholder="Ej. Texto literal de la Orden PJC/297/2026 (BOE-A-2026-7296)." value={form.quoteSource} onChange={(e) => setForm((f) => ({ ...f, quoteSource: e.target.value }))} />
              </div>
            )}

            {/* Operative Summary */}
            <div className="grid gap-2">
              <Label htmlFor="lr-summary">Síntesis operativa</Label>
              <Textarea id="lr-summary" placeholder="Resumen operativo de la norma…" rows={3} value={form.operativeSummary} onChange={(e) => setForm((f) => ({ ...f, operativeSummary: e.target.value }))} />
            </div>

            {/* Status + Source Type + Review Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="lr-status">Estado</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger id="lr-status"><SelectValue placeholder="Estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vigente">Vigente</SelectItem>
                    <SelectItem value="derogado">Derogado</SelectItem>
                    <SelectItem value="pendiente_revision">Pendiente de revisión</SelectItem>
                    <SelectItem value="validar_con_asesoria">Validar con asesoría</SelectItem>
                    <SelectItem value="orientativo">Orientativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lr-source">Tipo de fuente</Label>
                <Select value={form.sourceType} onValueChange={(v) => setForm((f) => ({ ...f, sourceType: v }))}>
                  <SelectTrigger id="lr-source"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SOURCE_TYPES).map(([code, label]) => (
                      <SelectItem key={code} value={code}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lr-review">Fecha de revisión</Label>
                <Input id="lr-review" type="date" value={form.reviewDate} onChange={(e) => setForm((f) => ({ ...f, reviewDate: e.target.value }))} />
              </div>
            </div>

            {/* Internal Notes */}
            <div className="grid gap-2">
              <Label htmlFor="lr-notes">Notas internas</Label>
              <Textarea id="lr-notes" placeholder="Notas visibles solo para administradores…" rows={3} value={form.internalNotes} onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeForm} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : editingRecord ? 'Guardar cambios' : 'Crear ficha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Archive Confirmation ---- */}
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archivar ficha legal</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas archivar la ficha &quot;<span className="font-semibold text-foreground">{archivingRecord?.title}</span>&quot;?
              Se marcará como inactiva y desaparecerá de la lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchive}
              disabled={archiving}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {archiving ? 'Archivando…' : 'Archivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}