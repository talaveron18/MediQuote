'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Download, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Budget = { id: string; code: string; client: { businessName: string } };
type ReconciliationStatus = 'match' | 'mismatch' | 'not_provided';
type Analysis = {
  key: string; label: string; estimated: number; actual: number | null;
  deviationAmount: number | null; deviationPercent: number | null; status: ReconciliationStatus;
};
type InternalLine = { key: string; label: string; amount: number; status: 'internal' };
type Audit = {
  id: string; estimatedCost: number; actualCost: number; deviationAmount: number; deviationPercent: number;
  estimatedBreakdown: string | null; analysis: string | null; notes: string | null;
  documentName: string | null; hasDocument: boolean; createdAt: string;
  budget: Budget; createdBy: { name: string };
};

const GESTORIA_COMPONENTS = [
  ['salary', 'Salario y pagas extra'], ['pluses', 'Pluses'], ['socialSecurity', 'Seguridad Social'],
  ['occupationalRisk', 'AT/EP'], ['contractCosts', 'Contratación, gestoría y finalización'],
] as const;
const money = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);

function parseAnalysis(value: string | null): { reconciliation: Analysis[]; internal: InternalLine[] } {
  try {
    const parsed = JSON.parse(value || '{}');
    if (Array.isArray(parsed)) {
      // Compatibilidad de lectura con auditorías anteriores a la separación gestoría/interno.
      return { reconciliation: parsed, internal: [] };
    }
    return {
      reconciliation: Array.isArray(parsed?.reconciliation) ? parsed.reconciliation : [],
      internal: Array.isArray(parsed?.internal) ? parsed.internal : [],
    };
  } catch { return { reconciliation: [], internal: [] }; }
}

const rowClass = (status: ReconciliationStatus) => status === 'match'
  ? 'bg-emerald-50 text-emerald-900'
  : status === 'mismatch'
    ? 'bg-red-50 text-red-900'
    : 'bg-amber-50 text-amber-900';

export default function CostAudit() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [budgetId, setBudgetId] = useState('');
  const [actualCost, setActualCost] = useState('');
  const [breakdown, setBreakdown] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [budgetsRes, auditsRes] = await Promise.all([fetch('/api/budgets'), fetch('/api/cost-audits')]);
      if (!budgetsRes.ok || !auditsRes.ok) throw new Error('No se pudo cargar la auditoría');
      setBudgets((await budgetsRes.json()).budgets ?? []);
      setAudits((await auditsRes.json()).audits ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Error al cargar'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true); setError('');
    try {
      if (file && file.size > 4 * 1024 * 1024) throw new Error('El justificante supera 4 MB');
      const documentBase64 = file ? await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('No se pudo leer el justificante')); reader.readAsDataURL(file);
      }) : undefined;
      const actualBreakdown = Object.fromEntries(Object.entries(breakdown).filter(([, value]) => value !== '').map(([key, value]) => [key, Number(value)]));
      const response = await fetch('/api/cost-audits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgetId, actualCost: Number(actualCost), actualBreakdown, notes,
          documentName: file?.name, documentType: file?.type, documentBase64 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar la auditoría');
      setBudgetId(''); setActualCost(''); setBreakdown({}); setNotes(''); setFile(null);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Error al guardar'); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Auditoría de presupuestos</h1><p className="text-sm text-gray-500">Contrasta solo los conceptos que conoce la gestoría y muestra aparte los costes internos de GASI.</p></div><Button variant="outline" onClick={() => void load()} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button></div>
    {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Auditar un presupuesto guardado</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2"><div><label className="mb-1 block text-sm font-medium">Presupuesto</label><Select value={budgetId} onValueChange={setBudgetId}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona el presupuesto" /></SelectTrigger><SelectContent>{budgets.map((budget) => <SelectItem key={budget.id} value={budget.id}>{budget.code} · {budget.client.businessName}</SelectItem>)}</SelectContent></Select></div><div><label className="mb-1 block text-sm font-medium">Coste total confirmado por gestoría (€)</label><Input type="number" min="0" step="0.01" value={actualCost} onChange={(event) => setActualCost(event.target.value)} /></div></div>
      <div><p className="mb-2 text-sm font-medium">Desglose de gestoría</p><p className="mb-3 text-xs text-gray-500">Solo introduce conceptos que aparezcan en la documentación de gestoría. Overhead, comisión y resultado GASI se muestran aparte y nunca se contrastan aquí.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{GESTORIA_COMPONENTS.map(([key, label]) => <div key={key}><label className="mb-1 block text-xs text-gray-600">{label}</label><Input type="number" min="0" step="0.01" value={breakdown[key] || ''} onChange={(event) => setBreakdown((all) => ({ ...all, [key]: event.target.value }))} /></div>)}</div></div>
      <div className="grid gap-4 md:grid-cols-2"><div><label className="mb-1 block text-sm font-medium">Documento de gestoría (PDF/imagen, máximo 4 MB)</label><Input type="file" accept="application/pdf,image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div><div><label className="mb-1 block text-sm font-medium">Observaciones</label><Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></div></div>
      <Button onClick={save} disabled={busy || !budgetId || actualCost === ''}><Upload className="mr-2 h-4 w-4" />Generar auditoría</Button>
    </CardContent></Card>
    <div className="space-y-3">{audits.length === 0 && <Card><CardContent className="p-6 text-sm text-gray-500">Todavía no hay auditorías registradas.</CardContent></Card>}{audits.map((audit) => {
      const parsed = parseAnalysis(audit.analysis);
      const allMatched = parsed.reconciliation.length > 0 && parsed.reconciliation.every((line) => line.status === 'match');
      const anyMismatch = parsed.reconciliation.some((line) => line.status === 'mismatch');
      return <Card key={audit.id}><CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{audit.budget.code} · {audit.budget.client.businessName}</h3><p className="text-xs text-gray-500">{new Date(audit.createdAt).toLocaleString('es-ES')} · {audit.createdBy.name}</p></div><div className={`rounded-full px-3 py-1 text-sm font-semibold ${allMatched ? 'bg-emerald-100 text-emerald-700' : anyMismatch ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{allMatched ? 'Conciliado' : anyMismatch ? 'Con diferencias' : 'Pendiente de desglose'}</div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded bg-gray-50 p-3"><p className="text-xs text-gray-500">Conciliable según MediQuote</p><p className="font-semibold">{money(audit.estimatedCost)}</p></div><div className="rounded bg-gray-50 p-3"><p className="text-xs text-gray-500">Gestoría</p><p className="font-semibold">{money(audit.actualCost)}</p></div><div className="rounded bg-gray-50 p-3"><p className="text-xs text-gray-500">Diferencia conciliable</p><p className={`font-semibold ${audit.deviationAmount === 0 ? 'text-emerald-700' : 'text-red-700'}`}>{audit.deviationAmount > 0 ? '+' : ''}{money(audit.deviationAmount)} ({audit.deviationPercent > 0 ? '+' : ''}{audit.deviationPercent.toFixed(2)} %)</p></div></div>
        {parsed.reconciliation.length > 0 && <div className="mt-4"><h4 className="mb-2 text-sm font-semibold">A. Comparación MediQuote ↔ gestoría</h4><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="py-2">Concepto</th><th>MediQuote</th><th>Gestoría</th><th>Diferencia</th><th>Estado</th></tr></thead><tbody>{parsed.reconciliation.map((line) => <tr key={line.key} className={`border-b ${rowClass(line.status)}`}><td className="py-2 px-2">{line.label}</td><td>{money(line.estimated)}</td><td>{line.actual === null ? 'No informado' : money(line.actual)}</td><td>{line.deviationAmount === null ? '—' : `${line.deviationAmount > 0 ? '+' : ''}${money(line.deviationAmount)}`}</td><td className="font-medium">{line.status === 'match' ? 'Coincide' : line.status === 'mismatch' ? 'Diferencia' : 'Sin dato'}</td></tr>)}</tbody></table></div></div>}
        {parsed.internal.length > 0 && <div className="mt-5"><h4 className="mb-1 text-sm font-semibold">B. Costes y resultado internos GASI</h4><p className="mb-2 text-xs text-gray-500">Se muestran para reconstruir la economía del presupuesto. No se comparan con la gestoría.</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="py-2">Concepto interno</th><th>Valor congelado en MediQuote</th><th>Conciliación gestoría</th></tr></thead><tbody>{parsed.internal.map((line) => <tr key={line.key} className="border-b bg-slate-50"><td className="py-2 px-2">{line.label}</td><td>{money(line.amount)}</td><td className="text-gray-500">No aplica</td></tr>)}</tbody></table></div></div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">{audit.notes ? <p className="text-sm text-gray-600">{audit.notes}</p> : <span />}{audit.hasDocument && <Button variant="outline" size="sm" asChild><a href={`/api/cost-audits?document=${encodeURIComponent(audit.id)}`}><Download className="mr-1 h-4 w-4" />{audit.documentName || 'Documento gestoría'}</a></Button>}</div>
      </CardContent></Card>;
    })}</div>
  </div>;
}
