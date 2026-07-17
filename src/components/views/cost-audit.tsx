'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Download, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Budget = { id: string; code: string; client: { businessName: string } };
type Analysis = { key: string; label: string; estimated: number; actual: number; deviationAmount: number; deviationPercent: number };
type Audit = {
  id: string; estimatedCost: number; actualCost: number; deviationAmount: number; deviationPercent: number;
  analysis: string | null; notes: string | null; documentName: string | null; hasDocument: boolean; createdAt: string;
  budget: Budget; createdBy: { name: string };
};

const COMPONENTS = [
  ['salary', 'Salario y pagas extra'], ['pluses', 'Pluses'], ['socialSecurity', 'Seguridad Social'],
  ['occupationalRisk', 'AT/EP'], ['contractCosts', 'Contratación, gestoría y finalización'],
  ['overhead', 'Overhead'], ['directCosts', 'Otros costes directos'],
] as const;
const money = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
const parseAnalysis = (value: string | null): Analysis[] => { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } };

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
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Auditoría continua de costes</h1><p className="text-sm text-gray-500">Contrasta el motor con la liquidación real de gestoría y conserva el justificante.</p></div><Button variant="outline" onClick={() => void load()} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button></div>
    {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Registrar contraste real</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2"><div><label className="mb-1 block text-sm font-medium">Presupuesto</label><Select value={budgetId} onValueChange={setBudgetId}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona el presupuesto" /></SelectTrigger><SelectContent>{budgets.map((budget) => <SelectItem key={budget.id} value={budget.id}>{budget.code} · {budget.client.businessName}</SelectItem>)}</SelectContent></Select></div><div><label className="mb-1 block text-sm font-medium">Coste real total de gestoría (€)</label><Input type="number" min="0" step="0.01" value={actualCost} onChange={(event) => setActualCost(event.target.value)} /></div></div>
      <div><p className="mb-2 text-sm font-medium">Desglose real (opcional, permite localizar qué parámetro se desvía)</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{COMPONENTS.map(([key, label]) => <div key={key}><label className="mb-1 block text-xs text-gray-600">{label}</label><Input type="number" min="0" step="0.01" value={breakdown[key] || ''} onChange={(event) => setBreakdown((all) => ({ ...all, [key]: event.target.value }))} /></div>)}</div></div>
      <div className="grid gap-4 md:grid-cols-2"><div><label className="mb-1 block text-sm font-medium">Justificante de gestoría (PDF/imagen, máximo 4 MB)</label><Input type="file" accept="application/pdf,image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div><div><label className="mb-1 block text-sm font-medium">Observaciones</label><Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></div></div>
      <Button onClick={save} disabled={busy || !budgetId || actualCost === ''}><Upload className="mr-2 h-4 w-4" />Guardar auditoría</Button>
    </CardContent></Card>
    <div className="space-y-3">{audits.length === 0 && <Card><CardContent className="p-6 text-sm text-gray-500">Todavía no hay contrastes registrados.</CardContent></Card>}{audits.map((audit) => { const analysis = parseAnalysis(audit.analysis); const positive = audit.deviationAmount > 0; return <Card key={audit.id}><CardContent className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{audit.budget.code} · {audit.budget.client.businessName}</h3><p className="text-xs text-gray-500">{new Date(audit.createdAt).toLocaleString('es-ES')} · {audit.createdBy.name}</p></div><div className={`rounded-full px-3 py-1 text-sm font-semibold ${positive ? 'bg-red-100 text-red-700' : audit.deviationAmount < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100'}`}>{audit.deviationAmount > 0 ? '+' : ''}{money(audit.deviationAmount)} ({audit.deviationPercent > 0 ? '+' : ''}{audit.deviationPercent.toFixed(2)} %)</div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded bg-gray-50 p-3"><p className="text-xs text-gray-500">Motor</p><p className="font-semibold">{money(audit.estimatedCost)}</p></div><div className="rounded bg-gray-50 p-3"><p className="text-xs text-gray-500">Gestoría</p><p className="font-semibold">{money(audit.actualCost)}</p></div><div className="rounded bg-gray-50 p-3"><p className="text-xs text-gray-500">Mayor desviación</p><p className="font-semibold">{analysis[0] ? `${analysis[0].label}: ${analysis[0].deviationAmount > 0 ? '+' : ''}${money(analysis[0].deviationAmount)}` : 'Sin desglose real'}</p></div></div>
      {analysis.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="py-2">Concepto</th><th>Motor</th><th>Real</th><th>Desviación</th></tr></thead><tbody>{analysis.map((line) => <tr key={line.key} className="border-b"><td className="py-2">{line.label}</td><td>{money(line.estimated)}</td><td>{money(line.actual)}</td><td>{line.deviationAmount > 0 ? '+' : ''}{money(line.deviationAmount)} ({line.deviationPercent.toFixed(2)} %)</td></tr>)}</tbody></table></div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">{audit.notes ? <p className="text-sm text-gray-600">{audit.notes}</p> : <span />}{audit.hasDocument && <Button variant="outline" size="sm" asChild><a href={`/api/cost-audits?document=${encodeURIComponent(audit.id)}`}><Download className="mr-1 h-4 w-4" />{audit.documentName || 'Justificante'}</a></Button>}</div>
    </CardContent></Card>; })}</div>
  </div>;
}
