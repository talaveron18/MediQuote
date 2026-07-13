'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Pencil, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useState } from 'react';

export interface LegalRecordData {
  id: string;
  key?: string | null;
  title: string;
  category: string;
  norm?: string | null;
  location?: string | null;
  reference?: string | null;
  eliUrl?: string | null;
  officialUrl?: string | null;
  hasLiteralQuote: boolean;
  literalQuote?: string | null;
  quoteSource?: string | null;
  operativeSummary?: string | null;
  status: string;
  reviewDate?: string | null;
}

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

interface LegalRecordDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: LegalRecordData | null;
  onEdit?: (record: LegalRecordData) => void;
}

export function LegalRecordDrawer({ open, onOpenChange, record, onEdit }: LegalRecordDrawerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!record) return null;

  const showLiteralQuote = record.hasLiteralQuote && !!record.literalQuote;
  const showUnverifiedQuote = !!record.literalQuote && !record.hasLiteralQuote;
  const noQuote = !record.literalQuote;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto p-0">
        {/* Blue header */}
        <div className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between">
          <SheetHeader className="p-0 gap-0">
            <SheetTitle className="text-white text-sm font-bold tracking-wide">
              § FICHA LEGAL
            </SheetTitle>
            <SheetDescription className="text-blue-200 text-xs">
              Registro normativo interno
            </SheetDescription>
          </SheetHeader>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-blue-600 transition"
            title={expanded ? 'Contraer' : 'Expandir'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {expanded && (
          <div className="px-4 py-3 space-y-3">
            {/* Title */}
            <h3 className="font-semibold text-sm leading-tight">{record.title}</h3>

            {/* Status badge */}
            <div>{statusBadge(record.status)}</div>

            {/* Fields */}
            <div className="space-y-2 text-sm">
              <Field label="Norma" value={record.norm} />
              <Field label="Ubicación" value={record.location} />
              <Field label="Referencia" value={record.reference} mono />
              <Field
                label="Revisado"
                value={record.reviewDate ? formatDate(record.reviewDate) : undefined}
              />
            </div>

            {/* Literal quote section */}
            {showLiteralQuote && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800">
                  <FileText className="w-3.5 h-3.5" />
                  Cita literal
                </div>
                <p className="text-xs text-blue-900/80 whitespace-pre-wrap leading-relaxed italic">
                  {record.literalQuote}
                </p>
                {record.quoteSource && (
                  <p className="text-[11px] text-blue-600/70 mt-1">
                    Fuente: {record.quoteSource}
                  </p>
                )}
              </div>
            )}

            {showUnverifiedQuote && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <FileText className="w-3.5 h-3.5" />
                  Transcripción sin verificar verbatim
                </div>
                <p className="text-xs text-amber-900/80 whitespace-pre-wrap leading-relaxed italic">
                  {record.literalQuote}
                </p>
                {record.quoteSource && (
                  <p className="text-[11px] text-amber-600/70 mt-1">
                    Fuente: {record.quoteSource}
                  </p>
                )}
              </div>
            )}

            {noQuote && (
              <div className="rounded-lg border border-dashed border-muted-foreground/20 p-3">
                <p className="text-xs text-muted-foreground italic">
                  Sin cita literal cargada
                </p>
              </div>
            )}

            {/* Operative summary */}
            {record.operativeSummary && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                <div className="text-xs font-semibold text-foreground">
                  Síntesis operativa
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {record.operativeSummary}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2 border-t">
              {record.officialUrl && (
                <a
                  href={record.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 text-white text-sm font-medium px-3 py-2 hover:bg-blue-700 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir en el BOE
                </a>
              )}
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => onEdit(record)}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Editar ficha
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ---- Small helpers ---- */

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono text-xs' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

function formatDate(date?: string | null) {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return date;
  }
}