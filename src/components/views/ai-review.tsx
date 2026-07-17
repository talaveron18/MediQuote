'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, FileCheck2, Gavel, History, Play, Save, Scale, ShieldCheck, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/store/app-store';
import { buildContractDraft, checkContractConsistency } from '@/lib/ai-review/contract';
import { DEMO_INTAKE_TEXT, DEMO_SNAPSHOT } from '@/lib/ai-review/demo-provider';
import { calculateScenario } from '@/lib/ai-review/scenarios';
import type { ContractDraft, DecisionStatus, HumanDecision, ReviewBundle, ServiceIntakeDraft } from '@/lib/ai-review/types';

const HISTORY_KEY = 'mediquote-ai-review-history-v1';
const DECISIONS_KEY = 'mediquote-ai-review-decisions-v1';
const severityClass = { info: 'bg-sky-50 border-sky-200', warning: 'bg-amber-50 border-amber-200', high: 'bg-orange-50 border-orange-300', critical: 'bg-red-50 border-red-300' };
const statusLabel = { apto: 'Apto', apto_con_observaciones: 'Con observaciones', no_apto: 'No apto' };

type HistoryEntry = { id: string; at: string; reference: string; status: string; mode: string };

export default function AiReview() {
  const currentUser = useAppStore((state) => state.currentUser);
  const [intakeText, setIntakeText] = useState(DEMO_INTAKE_TEXT);
  const [draft, setDraft] = useState<ServiceIntakeDraft | null>(null);
  const [bundle, setBundle] = useState<ReviewBundle | null>(null);
  const [contract, setContract] = useState<ContractDraft | null>(null);
  const [decisions, setDecisions] = useState<Record<string, HumanDecision>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(DECISIONS_KEY) ?? '{}'); } catch { return {}; }
  });
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
  });
  const [scenarioType, setScenarioType] = useState<'absentismo' | 'descuento' | 'incremento_salarial'>('absentismo');
  const [scenarioPercent, setScenarioPercent] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const scenario = useMemo(() => calculateScenario(DEMO_SNAPSHOT, scenarioType, scenarioPercent), [scenarioType, scenarioPercent]);
  const consistency = contract ? checkContractConsistency(DEMO_SNAPSHOT, contract) : null;

  async function post(body: unknown) {
    setError('');
    const response = await fetch('/api/ai-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Error de revisión');
    return data;
  }

  async function parseIntake() {
    setBusy('intake');
    try { setDraft((await post({ action: 'intake', payload: { text: intakeText } })).draft); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo interpretar'); }
    finally { setBusy(null); }
  }

  async function runReview() {
    setBusy('review');
    try {
      const result = await post({ action: 'review', payload: { snapshot: DEMO_SNAPSHOT } }) as ReviewBundle;
      setBundle(result);
      const entry = { id: crypto.randomUUID(), at: result.generatedAt, reference: DEMO_SNAPSHOT.reference, status: result.verdict.status, mode: result.mode };
      const next = [entry, ...history].slice(0, 30);
      setHistory(next); localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo revisar'); }
    finally { setBusy(null); }
  }

  function saveDecision(findingId: string, status: DecisionStatus, comment: string) {
    const decision = { findingId, status, comment, decidedAt: new Date().toISOString(), decidedBy: currentUser?.name ?? 'Usuario' };
    const next = { ...decisions, [findingId]: decision };
    setDecisions(next); localStorage.setItem(DECISIONS_KEY, JSON.stringify(next));
  }

  async function generateContract() {
    setBusy('contract');
    try { setContract((await post({ action: 'contract', payload: { snapshot: DEMO_SNAPSHOT, intentionalDemoMismatch: true } })).contract); }
    catch { setContract(buildContractDraft(DEMO_SNAPSHOT, true)); }
    finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Sparkles className="text-blue-700" /> Consejo IA y validación</h1><p className="text-sm text-gray-600">Capa consultiva. El motor determinista y los importes permanecen inmutables.</p></div>
        <Badge className="bg-violet-700">Modo demostración</Badge>
      </div>
      <Alert className="border-blue-200 bg-blue-50"><ShieldCheck /><AlertTitle>Revisión asistida, no aprobación automática</AlertTitle><AlertDescription>La IA no modifica presupuestos, no sustituye a la gestoría y no puede emitir ni firmar. Toda decisión relevante queda en manos de una persona.</AlertDescription></Alert>
      {error && <Alert variant="destructive"><AlertTriangle /><AlertTitle>No se completó la operación</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      <Tabs defaultValue="crear">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="crear">Crear con IA</TabsTrigger><TabsTrigger value="consejo">Consejo</TabsTrigger><TabsTrigger value="fiscal">Fiscal</TabsTrigger>
          <TabsTrigger value="escenarios">Escenarios</TabsTrigger><TabsTrigger value="contrato">Contrato</TabsTrigger><TabsTrigger value="coherencia">Coherencia</TabsTrigger><TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="crear" className="space-y-4">
          <Card><CardHeader><CardTitle>Solicitud en lenguaje natural</CardTitle><CardDescription>Describe el servicio. La propuesta resultante siempre requiere confirmación antes de alimentar un presupuesto real.</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea rows={7} value={intakeText} onChange={(e) => setIntakeText(e.target.value)} /><Button onClick={parseIntake} disabled={busy !== null}><Bot />{busy === 'intake' ? 'Interpretando…' : 'Preparar borrador'}</Button></CardContent></Card>
          {draft && <Card className="border-blue-200"><CardHeader><CardTitle>Borrador pendiente de confirmación</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{Object.entries(draft).filter(([key]) => key !== 'pendingConfirmation').map(([key, value]) => <div key={key}><Label className="capitalize">{key}</Label><div className="mt-1 rounded border bg-gray-50 p-2 text-sm">{Array.isArray(value) ? value.join(', ') : String(value)}</div></div>)}<div className="md:col-span-2"><Label>Pendiente</Label><ul className="mt-1 list-disc pl-5 text-sm text-amber-800">{draft.pendingConfirmation.map((item) => <li key={item}>{item}</li>)}</ul></div><Button className="md:col-span-2 w-fit" onClick={runReview} disabled={busy !== null}><Play />Confirmar foto demo y revisar</Button></CardContent></Card>}
        </TabsContent>

        <TabsContent value="consejo" className="space-y-4">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold">Consejo de cuatro especialistas</h2><p className="text-sm text-gray-500">Gestoría, finanzas, auditoría operativa y legal.</p></div><Button onClick={runReview} disabled={busy !== null}><Play />{busy === 'review' ? 'Revisando…' : 'Ejecutar consejo'}</Button></div>
          {bundle && <><Card className={bundle.verdict.status === 'no_apto' ? 'border-red-400' : 'border-amber-300'}><CardHeader><CardTitle>Veredicto: {statusLabel[bundle.verdict.status]}</CardTitle><CardDescription>{bundle.verdict.headline}</CardDescription></CardHeader><CardContent className="text-sm">{bundle.verdict.criticalCount} críticos · {bundle.verdict.highCount} altos · {bundle.verdict.conditions.length} validaciones humanas</CardContent></Card><div className="grid gap-4 xl:grid-cols-2">{bundle.reviews.map((review) => <Card key={review.reviewer}><CardHeader><div className="flex justify-between gap-3"><CardTitle>{review.label}</CardTitle><Badge variant={review.status === 'no_apto' ? 'destructive' : 'outline'}>{statusLabel[review.status]}</Badge></div><CardDescription>{review.summary}</CardDescription></CardHeader><CardContent className="space-y-3">{review.findings.map((item) => <FindingCard key={item.id} finding={item} decision={decisions[item.id]} onSave={saveDecision} />)}</CardContent></Card>)}</div></>}
        </TabsContent>

        <TabsContent value="fiscal">{bundle ? <Card className="border-red-300"><CardHeader><CardTitle className="flex items-center gap-2"><Gavel /> Abogado del diablo</CardTitle><CardDescription>No busca tranquilizar: intenta destruir la propuesta antes de que lo haga el mercado.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><p><b>Acusación:</b> {bundle.prosecutor.accusation}</p><p><b>Supuesto más débil:</b> {bundle.prosecutor.weakestAssumption}</p><p><b>Peor caso razonable:</b> {bundle.prosecutor.worstReasonableCase}</p><div><b>Pruebas exigibles:</b><ul className="list-disc pl-5">{bundle.prosecutor.evidenceToRequest.map((e) => <li key={e}>{e}</li>)}</ul></div><Alert className="border-red-200 bg-red-50"><Scale /><AlertTitle>Pregunta final</AlertTitle><AlertDescription>{bundle.prosecutor.finalChallenge}</AlertDescription></Alert></CardContent></Card> : <Empty text="Ejecuta primero el consejo." />}</TabsContent>

        <TabsContent value="escenarios"><Card><CardHeader><CardTitle>Simulador determinista</CardTitle><CardDescription>La fórmula calcula; la IA solo explica. Ningún resultado se guarda en el presupuesto.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Escenario</Label><Select value={scenarioType} onValueChange={(v) => setScenarioType(v as typeof scenarioType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="absentismo">Absentismo</SelectItem><SelectItem value="descuento">Descuento</SelectItem><SelectItem value="incremento_salarial">Incremento salarial</SelectItem></SelectContent></Select></div><div><Label>Variación (%)</Label><Input type="number" min={0} max={100} value={scenarioPercent} onChange={(e) => setScenarioPercent(Math.min(100, Math.max(0, Number(e.target.value))))} /></div></div><div className="grid gap-3 md:grid-cols-4"><Metric label="Coste original" value={scenario.originalCost} /><Metric label="Coste ajustado" value={scenario.adjustedCost} /><Metric label="Margen ajustado" value={scenario.adjustedMargin} /><Metric label="Variación margen" value={scenario.marginDelta} /></div><Alert className={scenario.status === 'rojo' ? 'border-red-300 bg-red-50' : scenario.status === 'ambar' ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}><AlertTriangle /><AlertTitle>Semáforo: {scenario.status}</AlertTitle><AlertDescription>{scenario.explanation}</AlertDescription></Alert></CardContent></Card></TabsContent>

        <TabsContent value="contrato" className="space-y-4"><Button onClick={generateContract} disabled={busy !== null}><FileCheck2 />Generar borrador demostrativo</Button>{contract && <Card><CardHeader><CardTitle>{contract.title}</CardTitle><CardDescription>NO VINCULANTE · requiere revisión legal y firma humana</CardDescription></CardHeader><CardContent className="space-y-4">{contract.clauses.map((clause) => <section key={clause.heading}><h3 className="font-semibold">{clause.heading}</h3><p className="text-sm text-gray-700">{clause.text}</p></section>)}<Alert className="border-amber-300 bg-amber-50"><AlertTriangle /><AlertTitle>Campos pendientes</AlertTitle><AlertDescription>{contract.pendingFields.join(' · ')}</AlertDescription></Alert></CardContent></Card>}</TabsContent>

        <TabsContent value="coherencia">{consistency ? <Card><CardHeader><CardTitle>{consistency.consistent ? 'Coherencia parcial superada' : 'Contradicción bloqueante detectada'}</CardTitle><CardDescription>Comparación automática entre la foto económica y el borrador contractual.</CardDescription></CardHeader><CardContent className="space-y-3">{consistency.issues.map((issue) => <div key={issue.field} className={`rounded border p-3 ${severityClass[issue.severity]}`}><b>{issue.message}</b><p className="text-sm">Presupuesto: {issue.budgetValue} · Contrato: {issue.contractValue}</p></div>)}</CardContent></Card> : <Empty text="Genera primero el contrato para ejecutar la comprobación." />}</TabsContent>

        <TabsContent value="historial"><Card><CardHeader><CardTitle className="flex items-center gap-2"><History /> Historial experimental</CardTitle><CardDescription>Registro local de ejecuciones. No sustituye el expediente corporativo ni el registro de auditoría del servidor.</CardDescription></CardHeader><CardContent>{history.length === 0 ? <p className="text-sm text-gray-500">Todavía no hay revisiones.</p> : <div className="space-y-2">{history.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded border p-3 text-sm"><span>{item.reference}</span><span>{statusLabel[item.status as keyof typeof statusLabel] ?? item.status}</span><span>{new Date(item.at).toLocaleString('es-ES')}</span><Badge variant="outline">{item.mode}</Badge></div>)}</div>}</CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}

function FindingCard({ finding, decision, onSave }: { finding: ReviewBundle['reviews'][number]['findings'][number]; decision?: HumanDecision; onSave: (id: string, status: DecisionStatus, comment: string) => void }) {
  const [status, setStatus] = useState<DecisionStatus>(decision?.status ?? 'aplazado');
  const [comment, setComment] = useState(decision?.comment ?? '');
  return <div className={`rounded border p-3 ${severityClass[finding.severity]}`}><div className="flex justify-between gap-2"><b>{finding.title}</b><Badge variant={finding.severity === 'critical' ? 'destructive' : 'outline'}>{finding.severity}</Badge></div><p className="mt-1 text-sm">{finding.detail}</p><p className="mt-2 text-sm"><b>Acción:</b> {finding.recommendation}</p><div className="mt-3 grid gap-2 sm:grid-cols-[170px_1fr_auto]"><Select value={status} onValueChange={(v) => setStatus(v as DecisionStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="aceptado">Aceptado</SelectItem><SelectItem value="resuelto">Resuelto</SelectItem><SelectItem value="aplazado">Aplazado</SelectItem><SelectItem value="bloqueado">Bloqueado</SelectItem></SelectContent></Select><Input placeholder="Comentario obligatorio" value={comment} onChange={(e) => setComment(e.target.value)} /><Button variant="outline" disabled={comment.trim().length < 3} onClick={() => onSave(finding.id, status, comment)}><Save />Guardar</Button></div>{decision && <p className="mt-2 text-xs text-gray-600">Última decisión: {decision.status}, por {decision.decidedBy}.</p>}</div>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded border bg-gray-50 p-3"><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-semibold">{value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p></div>; }
function Empty({ text }: { text: string }) { return <Card><CardContent className="flex items-center gap-2 py-8 text-sm text-gray-500"><CheckCircle2 />{text}</CardContent></Card>; }
