'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, ChevronDown,
  Download, Eye, FileCheck2, Gavel, History, Play, RefreshCcw,
  Scale, ShieldCheck, Sparkles, Target, UserRoundCheck, UsersRound, XCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { buildContractDraft, checkArtifactConsistency } from '@/lib/ai-review/contract';
import { buildDemoBundle, demoIntake, DEMO_INTAKE_TEXT, DEMO_SNAPSHOT } from '@/lib/ai-review/demo-provider';
import {
  allFindings, buildDefense, buildIntegrityRecord, buildOperationalAnnex, compareBudgetVersions,
  DEMO_FLOW, demoMetrics, effectiveVerdict, visibleFinancials,
} from '@/lib/ai-review/experience';
import { calculateScenario } from '@/lib/ai-review/scenarios';
import type {
  ContractDraft, DecisionStatus, HumanDecision, OperationalAnnex, ReviewBundle, ReviewFinding,
  ServiceIntakeDraft,
} from '@/lib/ai-review/types';
import { GasitoContextual, GasitoCouncil, GasitoFigure } from './gasito-council';

type CenterPanel = 'decision' | 'committee' | 'risks' | 'debate' | 'artifacts' | 'versions' | 'timeline';
type ViewMode = 'ejecutiva' | 'tecnica' | 'cliente';
type TimelineEntry = { id: string; time: string; text: string; kind: 'motor' | 'ia' | 'human' | 'document' };
const reviewerProgress = [
  ['gestoria', 'Gestoría está revisando costes laborales…'],
  ['finanzas', 'Finanzas está comprobando la resistencia del margen…'],
  ['auditor', 'Auditoría está buscando omisiones y contradicciones…'],
  ['legal', 'Legal está revisando la exposición contractual…'],
] as const;
const roleColor = { gestoria: 'border-cyan-300 bg-cyan-50', finanzas: 'border-emerald-300 bg-emerald-50', auditor: 'border-orange-300 bg-orange-50', legal: 'border-violet-300 bg-violet-50' };
const severityOrder = { critical: 0, high: 1, warning: 2, info: 3 };

const initialTimeline: TimelineEntry[] = [
  { id: 'created', time: '10:03', text: 'Presupuesto de demostración creado', kind: 'human' },
  { id: 'calculated', time: '10:04', text: 'Motor determinista calculó 29.400,00 €', kind: 'motor' },
];

export default function BuildWeekDemo({ presentation = false, connected = false }: { presentation?: boolean; connected?: boolean }) {
  const [started, setStarted] = useState(!presentation);
  const [panel, setPanel] = useState<CenterPanel>('decision');
  const [view, setView] = useState<ViewMode>('ejecutiva');
  const [step, setStep] = useState(presentation ? 0 : 3);
  const [intakeText, setIntakeText] = useState(DEMO_INTAKE_TEXT);
  const [draft, setDraft] = useState<ServiceIntakeDraft | null>(presentation ? null : demoIntake(DEMO_INTAKE_TEXT));
  const [bundle, setBundle] = useState<ReviewBundle | null>(null);
  const [committeeStage, setCommitteeStage] = useState(-1);
  const [decisions, setDecisions] = useState<Record<string, HumanDecision>>({});
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [scenarioPercent, setScenarioPercent] = useState(5);
  const [contract, setContract] = useState<ContractDraft | null>(null);
  const [annex, setAnnex] = useState<OperationalAnnex | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>(initialTimeline);
  const [versionChanged, setVersionChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceMode, setSourceMode] = useState<'demo' | 'openai'>('demo');
  const [cached, setCached] = useState(false);
  const [error, setError] = useState('');

  const findings = useMemo(() => allFindings(bundle).sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]), [bundle]);
  const selectedFinding = findings.find((finding) => finding.id === selectedFindingId) ?? findings[0];
  const verdict = effectiveVerdict(bundle, decisions);
  const scenario = calculateScenario(DEMO_SNAPSHOT, 'absentismo', scenarioPercent);
  const consistency = contract && annex ? checkArtifactConsistency(DEMO_SNAPSHOT, contract, annex) : null;
  const coherent = consistency?.consistent ?? false;
  const metrics = demoMetrics(bundle, decisions, coherent, Boolean(annex));
  const financials = visibleFinancials(DEMO_SNAPSHOT, view);
  const previousSnapshot = { ...DEMO_SNAPSHOT, priceExVat: 29040, totalWithVat: 29040, schedule: 'Turno pendiente de duración' };
  const comparison = compareBudgetVersions(previousSnapshot, DEMO_SNAPSHOT);
  const nextAction = !draft ? 'Describa la necesidad y confirme el borrador estructurado.'
    : !bundle && step < 2 ? 'Confirme la configuración y revise la foto del cálculo determinista.'
      : !bundle ? 'Ejecute el Consejo para revisar el expediente desde cuatro perspectivas.'
    : metrics.pendingCritical > 0 ? 'Resuelva el bloqueo de cobertura y descansos.'
      : Object.keys(decisions).length < 3 ? 'Registre tres decisiones humanas representativas.'
        : step < 4 ? 'Explore cómo el absentismo puede consumir el margen disponible.'
        : !contract ? 'Genere el contrato y el anexo operativo.'
          : !coherent ? 'Corrija la discrepancia contractual y repita la coherencia.'
            : 'El expediente está preparado para decisión humana final.';
  const complete = Boolean(bundle && verdict !== 'no_apto' && coherent && Object.keys(decisions).length >= 3);
  const unresolved = findings.filter((finding) => decisions[finding.id]?.status !== 'resuelto');

  function addTimeline(text: string, kind: TimelineEntry['kind']) {
    setTimeline((current) => [...current, { id: crypto.randomUUID(), time: `10:${String(3 + current.length).padStart(2, '0')}`, text, kind }]);
  }

  function resetDemo() {
    setStarted(true); setPanel('decision'); setView('ejecutiva'); setStep(0); setDraft(null); setBundle(null);
    setCommitteeStage(-1); setDecisions({}); setContract(null); setAnnex(null); setTimeline(initialTimeline);
    setSelectedFindingId(null); setScenarioPercent(5); setVersionChanged(false); setBusy(false); setSourceMode('demo'); setCached(false); setError('');
  }

  async function post(body: unknown) {
    const response = await fetch('/api/ai-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la revisión');
    return data;
  }

  async function prepareDraft() {
    setError('');
    try {
      const result = connected ? await post({ action: 'intake', payload: { text: intakeText } }) : { mode: 'demo', draft: demoIntake(intakeText) };
      setDraft(result.draft); setSourceMode(result.mode ?? 'demo'); setStep(1); addTimeline('Necesidad convertida en borrador estructurado', 'ia');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo preparar el borrador'); }
  }

  async function runCommittee() {
    setBusy(true); setError(''); setPanel('committee'); setStep(3); setCommitteeStage(0);
    for (let index = 0; index < reviewerProgress.length; index += 1) {
      setCommitteeStage(index); await new Promise((resolve) => window.setTimeout(resolve, 420));
    }
    try {
      const result: ReviewBundle & { cached?: boolean } = connected
        ? await post({ action: 'review', payload: { snapshot: DEMO_SNAPSHOT } })
        : buildDemoBundle(DEMO_SNAPSHOT);
      setBundle(result); setSourceMode(result.mode); setCached(Boolean(result.cached)); setCommitteeStage(4);
      setSelectedFindingId(result.reviews.flatMap((review) => review.findings).find((finding) => finding.severity === 'critical')?.id ?? null);
      addTimeline(`Consejo ${result.cached ? 'recuperado de caché' : 'completado'}: dictamen ${result.verdict.status}`, 'ia');
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : 'Falló el Consejo'}. Las revisiones anteriores se conservan.`); setCommitteeStage(-1);
    } finally { setBusy(false); }
  }

  function decide(finding: ReviewFinding, status: DecisionStatus, comment: string) {
    const next = { ...decisions, [finding.id]: { findingId: finding.id, status, comment, decidedAt: new Date().toISOString(), decidedBy: 'Fernando (demo)' } };
    setDecisions(next); addTimeline(`${status === 'resuelto' ? 'Incidencia resuelta' : 'Decisión registrada'}: ${finding.title}`, 'human');
  }

  function generateArtifacts() {
    setContract(buildContractDraft(DEMO_SNAPSHOT, true)); setAnnex(buildOperationalAnnex(DEMO_SNAPSHOT)); setStep(5); setPanel('artifacts');
    addTimeline('Contrato y anexo operativo generados con revisión pendiente', 'document');
  }

  function correctContract() {
    setContract(buildContractDraft(DEMO_SNAPSHOT, false)); addTimeline('Precio contractual corregido a 29.400,00 €', 'human');
  }

  async function exportRecord() {
    if (!bundle) return;
    const record = await buildIntegrityRecord(DEMO_SNAPSHOT, bundle, decisions);
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${DEMO_SNAPSHOT.reference}-registro-revision.json`; anchor.click(); URL.revokeObjectURL(url);
    addTimeline('Registro verificable exportado', 'document');
  }

  function nextPresentationStep() {
    if (!draft) return void prepareDraft();
    if (!bundle && step < 2) { setStep(2); addTimeline('Configuración confirmada y foto determinista bloqueada para revisión', 'motor'); return; }
    if (!bundle) return void runCommittee();
    const critical = findings.find((finding) => finding.severity === 'critical' && decisions[finding.id]?.status !== 'resuelto');
    if (critical) { decide(critical, 'resuelto', 'Cobertura de relevo confirmada para la demostración.'); setPanel('decision'); return; }
    const undecided = findings.find((finding) => !decisions[finding.id]);
    if (undecided && Object.keys(decisions).length < 3) { decide(undecided, 'aceptado', 'Riesgo aceptado con condición y responsable asignado.'); setPanel('decision'); return; }
    if (step < 4) { setStep(4); setPanel('decision'); addTimeline(`Escenario de absentismo revisado al ${scenarioPercent}%`, 'motor'); return; }
    if (!contract) return generateArtifacts();
    if (!coherent) return correctContract();
    setStep(6); setPanel('decision');
  }

  if (!started) return <DemoWelcome onStart={resetDemo} />;

  return (
    <div className={presentation ? 'mx-auto max-w-[1500px] rounded-2xl bg-slate-50 shadow-2xl' : 'mx-auto max-w-[1500px]'}>
      <header className="rounded-t-2xl border-b bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><Image src="/branding/gasi-logo.png" alt="GASI" width={82} height={34} className="object-contain" /><div className="h-8 w-px bg-slate-200" /><div><h1 className="font-bold text-slate-950">MediQuote Pro</h1><p className="text-xs text-slate-500">Centro de validación · {DEMO_SNAPSHOT.reference}</p></div></div>
          <div className="flex flex-wrap items-center gap-2"><Badge className={sourceMode === 'openai' ? 'bg-emerald-700' : 'bg-violet-700'}><Sparkles /> {sourceMode === 'openai' ? 'Resultado OpenAI' : 'Modo demostración'}{cached ? ' · caché' : ''}</Badge><ViewSwitcher value={view} onChange={setView} />{presentation && <Button size="sm" variant="outline" onClick={resetDemo}><RefreshCcw /> Reiniciar</Button>}</div>
        </div>
        <FlowBar current={step} />
      </header>

      <div className="grid min-h-[760px] lg:grid-cols-[1fr_340px]">
        <main className="min-w-0 space-y-4 p-4 sm:p-6">
          {error && <Alert className="border-red-300 bg-red-50"><XCircle /><AlertTitle>La función no se completó</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          <ExecutiveHeader verdict={verdict} critical={metrics.pendingCritical} warnings={unresolved.length - metrics.pendingCritical} pending={findings.filter((finding) => !decisions[finding.id]).length} complete={complete} />
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen económico y de revisión">
            <Kpi label="Precio" value={`${financials.priceExVat.toLocaleString('es-ES')} €`} detail="Sin IVA" />
            {financials.cost !== undefined ? <Kpi label="Coste completo" value={`${financials.cost.toLocaleString('es-ES')} €`} detail="Foto determinista" /> : <Kpi label="Servicio" value={DEMO_SNAPSHOT.professionalCategory} detail={`${DEMO_SNAPSHOT.professionals} profesional`} />}
            {financials.margin !== undefined ? <Kpi label="Margen disponible" value={`${financials.margin.toLocaleString('es-ES')} €`} detail="Antes de contingencias" /> : <Kpi label="Periodo" value="3 meses" detail={DEMO_SNAPSHOT.schedule} />}
            <Kpi label="Última revisión" value={bundle ? 'Completada' : 'Pendiente'} detail={bundle ? new Date(bundle.generatedAt).toLocaleTimeString('es-ES') : 'Ejecute el Consejo'} />
          </section>
          <NumberExplanation view={view} />

          <GasitoAction text={nextAction} complete={complete} onAction={nextPresentationStep} busy={busy} />

          <CommandCenter panel={panel} setPanel={setPanel} runCommittee={runCommittee} generateArtifacts={generateArtifacts} exportRecord={exportRecord} canExport={Boolean(bundle)} busy={busy} />

          {panel === 'decision' && <DecisionDashboard draft={draft} intakeText={intakeText} setIntakeText={setIntakeText} prepareDraft={prepareDraft} bundle={bundle} decisions={decisions} decide={decide} scenario={scenario} scenarioPercent={scenarioPercent} setScenarioPercent={setScenarioPercent} complete={complete} metrics={metrics} />}
          {panel === 'committee' && <LiveCommittee bundle={bundle} stage={committeeStage} onEvidence={(id) => { setSelectedFindingId(id); setPanel('risks'); }} />}
          {panel === 'risks' && <RiskMap findings={findings} decisions={decisions} onSelect={(id) => { setSelectedFindingId(id); }} />}
          {panel === 'debate' && <Debate bundle={bundle} />}
          {panel === 'artifacts' && <Artifacts contract={contract} annex={annex} consistency={consistency} onGenerate={generateArtifacts} onCorrect={correctContract} />}
          {panel === 'versions' && <Versions comparison={comparison} stale={versionChanged} onChange={() => setVersionChanged(true)} />}
          {panel === 'timeline' && <Timeline entries={timeline} />}
        </main>

        <FindingsRail findings={findings} decisions={decisions} selected={selectedFinding} onSelect={setSelectedFindingId} onResolve={(finding) => decide(finding, 'resuelto', 'Dato confirmado y evidencia incorporada en la demostración.')} />
      </div>
      {presentation && <footer className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t bg-white px-6 py-4"><p className="text-sm text-slate-500">Datos ficticios · cero cambios automáticos · revisión humana obligatoria</p><Button onClick={nextPresentationStep} disabled={busy}>{busy ? 'Consejo en curso…' : complete ? 'Expediente completado' : 'Siguiente paso'}<ArrowRight /></Button></footer>}
    </div>
  );
}

function DemoWelcome({ onStart }: { onStart: () => void }) {
  return <div className="mx-auto flex min-h-[86vh] max-w-5xl items-center justify-center"><div className="text-center text-white"><Image src="/branding/gasi-logo.png" alt="GASI" width={150} height={60} className="mx-auto mb-8 rounded bg-white p-3" /><Badge className="mb-4 bg-violet-600">OpenAI Build Week</Badge><h1 className="text-4xl font-black sm:text-6xl">Un presupuesto no está listo<br /><span className="text-cyan-300">solo porque suma bien.</span></h1><p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">MediQuote Pro combina cálculo determinista, cuatro perspectivas independientes y decisiones humanas trazables.</p><Button size="lg" className="mt-8 bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={onStart}><Play /> Iniciar demostración</Button><p className="mt-4 text-xs text-slate-500">Caso ficticio · sin clave · menos de cinco minutos</p></div></div>;
}

function FlowBar({ current }: { current: number }) {
  return <ol className="mt-4 grid grid-cols-7 gap-1" aria-label="Progreso de la demostración">{DEMO_FLOW.map((label, index) => <li key={label} className="min-w-0"><div className={`h-1.5 rounded-full ${index <= current ? 'bg-blue-600' : 'bg-slate-200'}`} /><p className={`mt-1 truncate text-center text-[10px] sm:text-xs ${index === current ? 'font-bold text-blue-700' : 'text-slate-500'}`}>{label}</p></li>)}</ol>;
}

function ViewSwitcher({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return <div className="flex rounded-lg border bg-slate-50 p-1" aria-label="Tipo de vista">{(['ejecutiva', 'tecnica', 'cliente'] as const).map((item) => <button key={item} onClick={() => onChange(item)} className={`rounded px-2 py-1 text-xs capitalize ${value === item ? 'bg-white font-semibold shadow-sm' : 'text-slate-500'}`}>{item}</button>)}</div>;
}

function ExecutiveHeader({ verdict, critical, warnings, pending, complete }: { verdict: string; critical: number; warnings: number; pending: number; complete: boolean }) {
  const blocked = verdict === 'no_apto';
  return <section className={`rounded-xl border-2 p-4 ${complete ? 'border-emerald-400 bg-emerald-50' : blocked ? 'border-red-400 bg-red-50' : 'border-amber-300 bg-amber-50'}`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3">{complete ? <CheckCircle2 className="h-8 w-8 text-emerald-700" /> : blocked ? <XCircle className="h-8 w-8 text-red-700" /> : <AlertTriangle className="h-8 w-8 text-amber-700" />}<div><p className="text-xs font-bold tracking-widest text-slate-500">{complete ? 'EXPEDIENTE PREPARADO PARA DECISIÓN' : blocked ? 'BLOQUEADO' : 'REVISIÓN NECESARIA'}</p><h2 className="text-xl font-black text-slate-950">{complete ? 'Sin bloqueos; decisión humana disponible' : !blocked ? 'Ejecute la revisión y registre decisiones' : 'Corrija los datos críticos antes de continuar'}</h2></div></div><div className="text-right text-sm"><b>{critical} críticos</b> · {warnings} advertencias<br /><span className="text-slate-500">{pending} decisiones pendientes</span></div></div></section>;
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card className="gap-2 py-4"><CardContent><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-xl font-bold text-slate-950">{value}</p><p className="truncate text-xs text-slate-500">{detail}</p></CardContent></Card>; }

function NumberExplanation({ view }: { view: ViewMode }) {
  if (view === 'cliente') return <details className="rounded-lg border bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">¿Cómo se obtiene el precio?</summary><div className="mt-3 space-y-2 text-slate-600"><p>El precio corresponde al servicio, cobertura y periodo descritos en la propuesta.</p><p>Incluye los recursos necesarios para prestar el alcance presupuestado. No muestra costes internos, márgenes ni comisiones.</p><p className="text-xs">Limitación: cualquier ampliación de cobertura debe presupuestarse y aprobarse por separado.</p></div></details>;
  if (view === 'tecnica') return <details className="rounded-lg border bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">¿Cómo se obtiene? · Explicación técnica interna</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><SmallFact label="Coste laboral" value={`${DEMO_SNAPSHOT.baseCost.toLocaleString('es-ES')} €`} /><SmallFact label="Pluses" value={`${DEMO_SNAPSHOT.pluses.toLocaleString('es-ES')} €`} /><SmallFact label="Seguridad Social" value={`${DEMO_SNAPSHOT.socialSecurity.toLocaleString('es-ES')} €`} /><SmallFact label="Overhead" value={`${DEMO_SNAPSHOT.overhead.toLocaleString('es-ES')} €`} /><p className="sm:col-span-2 lg:col-span-4 text-xs text-slate-500">Origen: foto del motor determinista. Variables: categoría, territorio, calendario, cobertura y contratación. La IA explica estos datos; no los recalcula.</p></div></details>;
  return <details className="rounded-lg border bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">¿Cómo se obtiene? · Resumen ejecutivo</summary><p className="mt-3 text-slate-600">El coste completo declarado es 19.495,00 €. El precio de 29.400,00 € conserva 9.905,00 € antes de contingencias. Absentismo, sustituciones o pluses no acreditados pueden consumir parte de ese margen.</p></details>;
}

function GasitoAction({ text, complete, onAction, busy }: { text: string; complete: boolean; onAction: () => void; busy: boolean }) {
  return <GasitoContextual text={text} complete={complete} onAction={onAction} busy={busy} />;
}

function CommandCenter({ panel, setPanel, runCommittee, generateArtifacts, exportRecord, canExport, busy }: { panel: CenterPanel; setPanel: (p: CenterPanel) => void; runCommittee: () => void; generateArtifacts: () => void; exportRecord: () => void; canExport: boolean; busy: boolean }) {
  const nav: Array<[CenterPanel, string, typeof Activity]> = [['decision', 'Decisión', Target], ['committee', 'Consejo', UsersRound], ['risks', 'Riesgos', AlertTriangle], ['debate', 'Fiscal vs Defensa', Gavel], ['artifacts', 'Contrato', FileCheck2], ['versions', 'Versiones', RefreshCcw], ['timeline', 'Trazabilidad', History]];
  return <Card className="gap-3 py-4"><CardContent><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1" role="navigation" aria-label="Centro de validación">{nav.map(([id, label, Icon]) => <button key={id} onClick={() => setPanel(id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${panel === id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" />{label}</button>)}</div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={runCommittee} disabled={busy}><UsersRound /> Consejo</Button><Button size="sm" variant="outline" onClick={generateArtifacts}><FileCheck2 /> Contrato</Button><Button size="sm" variant="outline" onClick={exportRecord} disabled={!canExport}><Download /> Registro</Button></div></div></CardContent></Card>;
}

function DecisionDashboard({ draft, intakeText, setIntakeText, prepareDraft, bundle, decisions, decide, scenario, scenarioPercent, setScenarioPercent, complete, metrics }: { draft: ServiceIntakeDraft | null; intakeText: string; setIntakeText: (v: string) => void; prepareDraft: () => void; bundle: ReviewBundle | null; decisions: Record<string, HumanDecision>; decide: (f: ReviewFinding, s: DecisionStatus, c: string) => void; scenario: ReturnType<typeof calculateScenario>; scenarioPercent: number; setScenarioPercent: (n: number) => void; complete: boolean; metrics: ReturnType<typeof demoMetrics> }) {
  const findings = allFindings(bundle);
  return <div className="space-y-4">{!draft && <Card><CardHeader><CardTitle>1. Describa la necesidad</CardTitle><CardDescription>La IA estructura; usted confirma. No se crea ningún presupuesto automáticamente.</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea rows={5} value={intakeText} onChange={(e) => setIntakeText(e.target.value)} /><Button onClick={prepareDraft}><Sparkles /> Preparar borrador</Button></CardContent></Card>}
    {draft && !bundle && <Card><CardHeader><CardTitle>2. Confirme la configuración</CardTitle><CardDescription>{draft.professionalCategory} · {draft.municipality} · {draft.schedule}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><SmallFact label="Periodo" value={`${draft.startDate} → ${draft.endDate}`} /><SmallFact label="Plantilla" value={`${draft.professionals} profesional`} /><SmallFact label="Contrato" value={draft.contractType} /><div className="sm:col-span-3 rounded-lg bg-amber-50 p-3 text-sm"><b>Pendiente:</b> {draft.pendingConfirmation.join(' · ')}</div></CardContent></Card>}
    {bundle && <><section className="grid gap-3 md:grid-cols-4">{bundle.reviews.map((review) => { const principal = review.findings[0]; return <Card key={review.reviewer} className={`gap-3 py-4 ${roleColor[review.reviewer]}`}><CardContent><div className="flex items-start justify-between"><GasitoFigure role={review.reviewer} state={review.status === 'no_apto' || principal?.severity === 'critical' ? 'con_hallazgos' : 'completado'} compact /><Badge variant={review.status === 'no_apto' ? 'destructive' : 'outline'}>{review.status === 'no_apto' ? 'Bloquea' : 'Revisado'}</Badge></div><h3 className="mt-1 font-bold">Gasito {review.label}</h3><p className="mt-1 text-xs text-slate-600">{review.summary}</p><p className="mt-3 text-sm font-semibold">{principal.title}</p></CardContent></Card>; })}</section>
      <Card><CardHeader><CardTitle>Antes y después</CardTitle><CardDescription>El valor está en mejorar el expediente, no en producir texto.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Antes de revisar</th><th className="p-2">Después de revisar</th><th className="p-2">Estado</th></tr></thead><tbody>{findings.slice(0, 4).map((finding) => { const resolved = decisions[finding.id]?.status === 'resuelto'; return <tr key={finding.id} className="border-b"><td className="p-2">{finding.title}</td><td className="p-2">{resolved ? decisions[finding.id].comment : finding.recommendation}</td><td className="p-2"><Badge variant={resolved ? 'outline' : finding.severity === 'critical' ? 'destructive' : 'secondary'}>{resolved ? 'Resuelto' : 'Pendiente'}</Badge>{!resolved && <Button size="sm" variant="ghost" onClick={() => decide(finding, 'resuelto', 'Evidencia confirmada en la sesión demo.')} className="ml-1">Resolver</Button>}</td></tr>; })}</tbody></table></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Resistencia del margen</CardTitle><CardDescription>Escenario determinista de absentismo. La IA no recalcula.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 sm:grid-cols-[1fr_180px]"><Input type="range" min={0} max={20} value={scenarioPercent} onChange={(e) => setScenarioPercent(Number(e.target.value))} aria-label="Absentismo estimado" /><div className="rounded border p-2 text-center font-bold">{scenarioPercent}% absentismo</div></div><div className="grid gap-2 sm:grid-cols-3"><SmallFact label="Coste ajustado" value={`${scenario.adjustedCost.toLocaleString('es-ES')} €`} /><SmallFact label="Margen ajustado" value={`${scenario.adjustedMargin.toLocaleString('es-ES')} €`} /><SmallFact label="Semáforo" value={scenario.status.toUpperCase()} /></div></CardContent></Card></>}
    {complete && <FinalSummary metrics={metrics} />}</div>;
}

function LiveCommittee({ bundle, stage, onEvidence }: { bundle: ReviewBundle | null; stage: number; onEvidence: (findingId: string) => void }) {
  return <div className="space-y-4"><Card><CardHeader><CardTitle>Mesa del Consejo</CardTitle><CardDescription>Una familia Gasito, cinco funciones diferenciadas y cuatro votos independientes sobre la misma foto inmutable.</CardDescription></CardHeader><CardContent><GasitoCouncil bundle={bundle} stage={stage} onEvidence={onEvidence} /></CardContent></Card>{bundle && <Card className="border-slate-900"><CardHeader><CardTitle>Dictamen conjunto: {bundle.verdict.status.replaceAll('_', ' ')}</CardTitle><CardDescription>{bundle.verdict.headline}</CardDescription></CardHeader><CardContent><p className="text-sm">Gasito modera, pero no vota. Un crítico prevalece sobre cualquier promedio. {bundle.contradictions?.length ?? 0} desacuerdo(s) explícito(s).</p></CardContent></Card>}</div>;
}

function RiskMap({ findings, decisions, onSelect }: { findings: ReviewFinding[]; decisions: Record<string, HumanDecision>; onSelect: (id: string) => void }) {
  if (!findings.length) return <Empty text="Ejecute el Consejo para construir el mapa de riesgos." />;
  return <Card><CardHeader><CardTitle>Mapa visual de riesgos</CardTitle><CardDescription>La probabilidad queda como “No evaluable” cuando no existe base estadística.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Riesgo</th><th>Categoría</th><th>Impacto</th><th>Probabilidad</th><th>Responsable</th><th>Estado</th><th /></tr></thead><tbody>{findings.map((finding) => <tr key={finding.id} className="border-b"><td className="p-2 font-semibold">{finding.title}</td><td>{finding.riskCategory?.replace('_', ' ')}</td><td>{finding.impact}</td><td>{finding.probability?.replace('_', ' ')}</td><td>{finding.responsible}</td><td><Badge variant={decisions[finding.id]?.status === 'resuelto' ? 'outline' : finding.severity === 'critical' ? 'destructive' : 'secondary'}>{decisions[finding.id]?.status ?? 'pendiente'}</Badge></td><td><Button size="sm" variant="ghost" onClick={() => onSelect(finding.id)}>Ver evidencia</Button></td></tr>)}</tbody></table></div></CardContent></Card>;
}

function Debate({ bundle }: { bundle: ReviewBundle | null }) {
  if (!bundle) return <Empty text="Ejecute el Consejo para habilitar Fiscal contra Defensa." />;
  const defense = bundle.defense ?? buildDefense(DEMO_SNAPSHOT, bundle);
  return <div className="grid gap-4 lg:grid-cols-2"><Card className="border-red-300"><CardHeader><CardTitle className="flex items-center gap-2"><Gavel /> Fiscal</CardTitle><CardDescription>El argumento más fuerte contra aprobar.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><p><b>Acusación:</b> {bundle.prosecutor.accusation}</p><p><b>Supuesto débil:</b> {bundle.prosecutor.weakestAssumption}</p><p><b>Peor caso:</b> {bundle.prosecutor.worstReasonableCase}</p><Alert className="border-red-200 bg-red-50"><AlertTriangle /><AlertTitle>Desafío</AlertTitle><AlertDescription>{bundle.prosecutor.finalChallenge}</AlertDescription></Alert></CardContent></Card><Card className="border-emerald-300"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck /> Defensa</CardTitle><CardDescription>Lo que sí está respaldado y bajo qué condiciones.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><p><b>Precio defendible:</b> {defense.priceDefense}</p><ul className="list-disc space-y-1 pl-5">{defense.strongestGrounds.map((item) => <li key={item}>{item}</li>)}</ul><p><b>Condiciones:</b> {defense.approvalConditions.slice(0, 2).join(' · ')}</p></CardContent></Card>{Boolean(bundle.contradictions?.length) && <Alert className="border-orange-300 bg-orange-50 lg:col-span-2"><Scale /><AlertTitle>Desacuerdo entre revisores</AlertTitle><AlertDescription>{bundle.contradictions?.map((item) => `${item.statement} ${item.consequence}`).join(' ')}</AlertDescription></Alert>}</div>;
}

function Artifacts({ contract, annex, consistency, onGenerate, onCorrect }: { contract: ContractDraft | null; annex: OperationalAnnex | null; consistency: ReturnType<typeof checkArtifactConsistency> | null; onGenerate: () => void; onCorrect: () => void }) {
  if (!contract || !annex) return <EmptyAction text="Genere contrato y anexo operativo para comprobar los tres artefactos." action="Generar artefactos" onClick={onGenerate} />;
  const clauses = ['Objeto', 'Duración y horario', 'Equipo', 'Precio', 'Protección de datos', 'Condición de validez'];
  return <div className="space-y-4"><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Borrador contractual</CardTitle><CardDescription>No vinculante · revisión humana obligatoria</CardDescription></CardHeader><CardContent className="space-y-2">{contract.clauses.map((clause) => <details key={clause.heading} className="rounded border p-3"><summary className="cursor-pointer font-semibold">{clause.heading}</summary><p className="mt-2 text-sm text-slate-600">{clause.text}</p></details>)}</CardContent></Card><Card><CardHeader><CardTitle>Anexo operativo</CardTitle><CardDescription>Convierte el presupuesto en instrucciones de prestación revisables.</CardDescription></CardHeader><CardContent className="space-y-2">{annex.sections.map((section) => <div key={section.heading} className="rounded border p-3"><b>{section.heading}</b><p className="text-sm text-slate-600">{section.text}</p></div>)}</CardContent></Card></div><Card><CardHeader><CardTitle>Mapa cláusula–riesgo</CardTitle></CardHeader><CardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{clauses.map((clause) => <div key={clause} className="rounded border p-3 text-sm"><b>{clause}</b><p className="text-slate-500">{clause === 'Precio' && !consistency?.consistent ? 'Cláusula contradictoria' : clause === 'Condición de validez' ? 'Cláusula pendiente de datos' : 'Cláusula presente'}</p></div>)}</div></CardContent></Card>{consistency && <Alert className={consistency.consistent ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}>{consistency.consistent ? <CheckCircle2 /> : <XCircle />}<AlertTitle>{consistency.consistent ? 'Presupuesto, contrato y anexo coherentes' : 'Incoherencia crítica detectada'}</AlertTitle><AlertDescription><div className="flex flex-wrap items-center justify-between gap-2"><span>{consistency.issues.map((issue) => issue.message).join(' ')}</span>{!consistency.consistent && <Button size="sm" onClick={onCorrect}>Corregir a 29.400 €</Button>}</div></AlertDescription></Alert>}</div>;
}

function Versions({ comparison, stale, onChange }: { comparison: ReturnType<typeof compareBudgetVersions>; stale: boolean; onChange: () => void }) {
  return <div className="space-y-4"><Card><CardHeader><CardTitle>Versión anterior vs. actual</CardTitle><CardDescription>Un cambio material invalida el dictamen anterior.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Campo</th><th>Anterior</th><th>Actual</th><th>Impacto</th></tr></thead><tbody>{comparison.changes.map((change) => <tr key={change.field} className="border-b"><td className="p-2 font-semibold">{change.field}</td><td>{change.before}</td><td>{change.after}</td><td>{change.material ? 'Revisión necesaria' : 'Informativo'}</td></tr>)}</tbody></table></div><Button className="mt-4" variant="outline" onClick={onChange}>Simular nuevo cambio de precio</Button></CardContent></Card>{stale && <Alert className="border-orange-300 bg-orange-50"><RefreshCcw /><AlertTitle>REVISIONES DESACTUALIZADAS</AlertTitle><AlertDescription>El presupuesto ha cambiado. El dictamen anterior permanece en historial, pero no puede utilizarse para aprobar esta versión.</AlertDescription></Alert>}</div>;
}

function Timeline({ entries }: { entries: TimelineEntry[] }) { return <Card><CardHeader><CardTitle>Línea de tiempo verificable</CardTitle><CardDescription>Qué ocurrió, cuándo y si intervino una persona, el motor, la IA o un documento.</CardDescription></CardHeader><CardContent><ol className="relative ml-3 border-l-2 border-slate-200">{entries.map((entry) => <li key={entry.id} className="relative mb-5 ml-6"><span className={`absolute -left-[31px] top-0 h-3 w-3 rounded-full ring-4 ring-white ${entry.kind === 'human' ? 'bg-blue-600' : entry.kind === 'motor' ? 'bg-slate-900' : entry.kind === 'ia' ? 'bg-violet-600' : 'bg-emerald-600'}`} /><time className="text-xs text-slate-500">{entry.time} · {entry.kind}</time><p className="text-sm font-medium">{entry.text}</p></li>)}</ol></CardContent></Card>; }

function FindingsRail({ findings, decisions, selected, onSelect, onResolve }: { findings: ReviewFinding[]; decisions: Record<string, HumanDecision>; selected?: ReviewFinding; onSelect: (id: string) => void; onResolve: (finding: ReviewFinding) => void }) {
  return <aside className="border-l bg-white p-4" aria-label="Hallazgos del expediente"><div className="sticky top-4 space-y-4"><div><h2 className="font-bold">Hallazgos</h2><p className="text-xs text-slate-500">Críticos y pendientes primero</p></div>{findings.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">Aún no hay hallazgos. Ejecute el Consejo.</div> : <div className="max-h-[360px] space-y-2 overflow-auto pr-1">{findings.map((finding) => { const resolved = decisions[finding.id]?.status === 'resuelto'; return <button key={finding.id} onClick={() => onSelect(finding.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${selected?.id === finding.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'} ${resolved ? 'opacity-60' : ''}`}><div className="flex justify-between gap-2"><b>{finding.title}</b><Badge variant={!resolved && finding.severity === 'critical' ? 'destructive' : 'outline'}>{resolved ? 'resuelto' : finding.severity}</Badge></div><p className="mt-1 text-xs text-slate-500">{finding.riskCategory?.replace('_', ' ')}</p></button>; })}</div>}{selected && <div className="rounded-xl bg-slate-950 p-4 text-white"><p className="text-xs font-bold uppercase tracking-wide text-cyan-300">¿Por qué se ha detectado?</p><p className="mt-2 text-sm">{selected.whyDetected ?? selected.detail}</p><div className="mt-3 rounded bg-white/10 p-2 text-xs"><b>Origen:</b> {selected.evidenceSource?.replace('_', ' ')}<br /><b>Evidencia:</b> {selected.evidence.join(' · ')}</div><p className="mt-3 text-xs text-slate-300"><b>Acción:</b> {selected.recommendation}</p>{decisions[selected.id]?.status !== 'resuelto' && <Button className="mt-3 w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300" size="sm" onClick={() => onResolve(selected)}>Resolver incidencia</Button>}</div>}</div></aside>;
}

function FinalSummary({ metrics }: { metrics: ReturnType<typeof demoMetrics> }) { return <Card className="border-2 border-emerald-400 bg-gradient-to-br from-emerald-50 to-white"><CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><UserRoundCheck className="text-emerald-700" /> EXPEDIENTE PREPARADO PARA DECISIÓN</CardTitle><CardDescription>La aprobación sigue perteneciendo a una persona.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SmallFact label="Perspectivas" value={String(metrics.perspectives)} /><SmallFact label="Riesgos detectados" value={String(metrics.risks)} /><SmallFact label="Riesgos resueltos" value={String(metrics.resolved)} /><SmallFact label="Cambios automáticos" value={String(metrics.automaticChanges)} /><SmallFact label="Críticos pendientes" value={String(metrics.pendingCritical)} /><SmallFact label="Decisiones humanas" value={String(metrics.decisions)} /><SmallFact label="Artefactos comprobados" value={String(metrics.checkedArtifacts)} /><SmallFact label="Coherencia" value={metrics.coherent ? 'Completa' : 'Pendiente'} /></CardContent></Card>; }

function SmallFact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <Card><CardContent className="flex items-center gap-2 py-10 text-sm text-slate-500"><Eye />{text}</CardContent></Card>; }
function EmptyAction({ text, action, onClick }: { text: string; action: string; onClick: () => void }) { return <Card><CardContent className="flex flex-col items-center gap-4 py-12 text-center"><FileCheck2 className="h-9 w-9 text-slate-400" /><p className="text-sm text-slate-500">{text}</p><Button onClick={onClick}>{action}</Button></CardContent></Card>; }
