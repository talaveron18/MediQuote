'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LegalBadgeButton } from '@/components/legal/legal-badge-button';
import { LegalRecordDrawer, type LegalRecordData } from '@/components/legal/legal-record-drawer';

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
  legalRecordId?: string | null;
  legalRecord?: LegalRecordSummary | null;
}

function normalizeRecord(record: LegalRecordSummary): LegalRecordSummary {
  return {
    id: record.id,
    key: record.key,
    title: record.title,
    reference: record.reference,
    norm: record.norm,
    location: record.location,
    eliUrl: record.eliUrl,
    officialUrl: record.officialUrl,
    status: record.status,
    category: record.category,
    hasLiteralQuote: record.hasLiteralQuote,
    literalQuote: record.literalQuote,
    quoteSource: record.quoteSource,
    operativeSummary: record.operativeSummary,
    reviewDate: record.reviewDate,
  };
}

export default function LegalParametersPanel() {
  const [parameters, setParameters] = useState<LegalParameter[]>([]);
  const [legalRecords, setLegalRecords] = useState<LegalRecordSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRecord, setDrawerRecord] = useState<LegalRecordData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [paramsRes, recordsRes] = await Promise.all([
        fetch('/api/legal-parameters'),
        fetch('/api/legal-records'),
      ]);

      if (!paramsRes.ok) throw new Error('Error al cargar parámetros');
      const paramsData = await paramsRes.json();
      setParameters(Array.isArray(paramsData) ? paramsData : paramsData.parameters ?? []);

      if (recordsRes.ok) {
        const recordsData = await recordsRes.json();
        const records: LegalRecordSummary[] = Array.isArray(recordsData) ? recordsData : recordsData.records ?? [];
        setLegalRecords(records.map(normalizeRecord));
      }
    } catch {
      toast.error('Error al cargar parámetros legales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return parameters;
    return parameters.filter((param) =>
      param.key.toLowerCase().includes(q) ||
      param.label.toLowerCase().includes(q) ||
      param.value.toLowerCase().includes(q) ||
      param.category.toLowerCase().includes(q),
    );
  }, [parameters, query]);

  function openRecordDrawer(param: LegalParameter) {
    const record = param.legalRecord ?? legalRecords.find((item) => item.id === param.legalRecordId) ?? null;
    if (!record) {
      toast.error('No se encontró la ficha legal vinculada');
      return;
    }
    setDrawerRecord(record as LegalRecordData);
    setDrawerOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar parámetro legal..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-8 h-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clave</TableHead>
                  <TableHead>Etiqueta</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Categoría</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      Cargando parámetros...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No hay parámetros legales que mostrar.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((param) => (
                    <TableRow key={param.id}>
                      <TableCell className="font-mono text-xs">{param.key}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{param.label}</span>
                          {(param.legalRecord || param.legalRecordId) && (
                            <LegalBadgeButton onClick={() => openRecordDrawer(param)} title="Ver soporte legal" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{param.value}</TableCell>
                      <TableCell className="text-muted-foreground">{param.unit ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{param.category}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <LegalRecordDrawer open={drawerOpen} onOpenChange={setDrawerOpen} record={drawerRecord} />
    </div>
  );
}
