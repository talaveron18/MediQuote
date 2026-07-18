'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, MessageSquare, Send, ShieldCheck, X } from 'lucide-react';
import BudgetForm from './budget-form';
import { useAppStore, emptyBlock } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { buildServiceLocation, getMunicipalitiesForProvince, getProvincesForCommunity } from '@/lib/service-locations';
import {
  assertFiniteBudget,
  EXTERNAL_SOURCE_DISCLAIMER,
  findManualChanges,
  LEGAL_DISCLAIMER,
  mergeWithoutOverwriting,
  type AiBudgetReply,
  type NormativeSource,
} from '@/lib/ai-budget';
import type { BudgetCalculationResult, BudgetInput, ServiceBlockInput } from '@/lib/types';

type Message = { id: number; role: 'user' | 'assistant'; text: string; sources?: NormativeSource[]; external?: boolean };

function money(value: unknown): string {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(number);
}

function AuditPanel({ onBack }: { onBack: () => void }) {
  const store = useAppStore();
  const internal = store.currentRole === 'admin' || store.currentRole === 'maestro';
  const totals = store.budgetTotals;
  const warningCount = store.blockResults.reduce((sum, block) => sum + (block.laborWarnings?.length ?? 0), 0);
  const blockers = store.blockResults.flatMap((block, index) => (block.laborWarnings ?? [])
    .filter((warning) => warning.severity === 'error')
    .map((warning) => `Bloque ${index + 1}: ${warning.message}`));
  const finite = assertFiniteBudget(totals);
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Presupuesto con IA · cálculo determinista completado</p>
          <h1 className="text-2xl font-semibold">Revisión antes de decidir</h1>
        </div>
        <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Volver al formulario</Button>
      </div>
      {!finite && <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4 text-red-900"><strong>Bloqueado:</strong> el motor ha producido un valor no finito. No guarde ni emita este presupuesto.</div>}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Estado</CardTitle></CardHeader><CardContent><Badge className={blockers.length ? 'bg-red-600' : warningCount ? 'bg-amber-500' : 'bg-emerald-600'}>{blockers.length ? 'BLOQUEADO' : warningCount ? 'REVISIÓN' : 'SIN BLOQUEOS'}</Badge></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Precio cliente</CardTitle></CardHeader><CardContent className="text-xl font-bold">{money(totals?.totalFinal)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Cobertura</CardTitle></CardHeader><CardContent>{store.serviceBlocks.length} bloque(s) · {store.blockResults.reduce((s,b) => s + (b.totalHours || 0), 0).toLocaleString('es-ES')} h</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Hallazgos</CardTitle></CardHeader><CardContent className="text-xl font-bold">{warningCount}</CardContent></Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Cobertura y jornada</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {store.serviceBlocks.map((block, index) => {
              const result = store.blockResults[index];
              const category = store.categories.find((item) => item.id === block.professionalCategory)?.name || block.professionalCategory || 'Sin categoría';
              return <div key={index} className="rounded-lg border p-3 text-sm">
                <div className="font-semibold">{index + 1}. {category}</div>
                <div className="mt-1 text-gray-600">{block.dateRangeStart || '—'} → {block.dateRangeEnd || '—'} · {block.hoursPerDay} h/turno · plantilla {result?.plantillaSeleccionada ?? block.plantillaSeleccionada ?? 1}</div>
                {(result?.laborWarnings ?? []).map((warning, i) => <div key={i} className={`mt-2 rounded px-2 py-1 ${warning.severity === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>{warning.message}</div>)}
              </div>;
            })}
            {!warningCount && <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4" />No hay advertencias de jornada en este cálculo.</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Economía y decisión humana</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span>Base</span><strong>{money(totals ? totals.subtotal + totals.totalSurcharges - totals.discountAmount : 0)}</strong></div>
            <div className="flex justify-between"><span>IVA por partidas</span><strong>{money(totals?.ivaAmount)}</strong></div>
            <div className="flex justify-between"><span>Descuento</span><strong>{money(totals?.discountAmount)}</strong></div>
            <Separator />
            {internal ? <>
              <div className="rounded-lg bg-slate-50 p-3"><ShieldCheck className="mb-2 h-4 w-4 text-slate-700" /><strong>Vista interna autorizada.</strong> El desglose económico sensible permanece sujeto a los permisos y a la respuesta saneada del servidor.</div>
              <p>Antes de aprobar: contrastar el coste con gestoría, confirmar convenio territorial, pluses y descansos, y registrar las decisiones humanas.</p>
            </> : <div className="rounded-lg bg-amber-50 p-3 text-amber-900">La vista comercial no muestra costes, margen ni comisión interna. Solicite validación a Administración.</div>}
          </CardContent>
        </Card>
      </div>
      <Card><CardHeader><CardTitle className="text-base">Bloqueos y pendientes</CardTitle></CardHeader><CardContent>{blockers.length ? <ul className="list-disc space-y-1 pl-5 text-red-800">{blockers.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-emerald-700">No hay bloqueos automáticos. La aprobación sigue siendo una decisión humana.</p>}</CardContent></Card>
    </div>
  );
}

export default function AiBudget() {
  const store = useAppStore();
  const [stage, setStage] = useState<'compose' | 'audit'>('compose');
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'auto' | 'budget' | 'normative'>('auto');
  const [messages, setMessages] = useState<Message[]>([{ id: 1, role: 'assistant', text: 'Describe el servicio en lenguaje normal. Prepararé los campos operativos del formulario; el precio lo calculará únicamente el motor de MediQuote.' }]);
  const lastBudgetAi = useRef<Partial<BudgetInput>>({});
  const lastBlockAi = useRef<Partial<ServiceBlockInput>>({});
  const nextId = useRef(2);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (assistantOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [assistantOpen, loading, messages]);

  const applyPatch = useCallback((reply: AiBudgetReply) => {
    if (!reply.patch) return;
    const budgetLocks = findManualChanges(store.budgetForm, lastBudgetAi.current);
    let budgetPatch = reply.patch.budget ?? {};
    if (budgetPatch.serviceAutonomousCommunity) {
      const community = budgetPatch.serviceAutonomousCommunity;
      const province = budgetPatch.serviceProvince || getProvincesForCommunity(community)[0];
      const municipalities = getMunicipalitiesForProvince(community, province);
      const municipality = budgetPatch.serviceMunicipality
        ? municipalities.find((item) => item.name.toLocaleLowerCase('es') === budgetPatch.serviceMunicipality?.toLocaleLowerCase('es'))
        : undefined;
      if (municipality) {
        const location = buildServiceLocation(municipality);
        budgetPatch = { ...budgetPatch, serviceLocationId: location.id, serviceProvince: province, serviceMunicipality: municipality.name };
      } else {
        // Nunca se inventa un municipio: queda vacío hasta que el usuario lo confirme.
        budgetPatch = { ...budgetPatch, serviceLocationId: '', serviceProvince: province, serviceMunicipality: '' };
      }
    }
    const mergedBudget = mergeWithoutOverwriting(store.budgetForm, budgetPatch, budgetLocks);
    store.setBudgetForm(mergedBudget);
    lastBudgetAi.current = { ...lastBudgetAi.current, ...Object.fromEntries(Object.keys(budgetPatch).map((key) => [key, mergedBudget[key as keyof BudgetInput]])) } as Partial<BudgetInput>;

    const current = store.serviceBlocks[0] ?? { ...emptyBlock };
    const blockLocks = findManualChanges(current, lastBlockAi.current);
    let blockPatch = reply.patch.block ?? {};
    if (blockPatch.professionalCategory) {
      const requested = blockPatch.professionalCategory.toLowerCase();
      const category = store.categories.find((item) => item.name.toLowerCase().includes(requested.split('/')[0]) || requested.includes(item.name.toLowerCase()));
      if (category?.id) blockPatch = { ...blockPatch, professionalCategory: category.id };
      else {
        const rest = { ...blockPatch };
        delete rest.professionalCategory;
        blockPatch = rest;
      }
    }
    const mergedBlock = mergeWithoutOverwriting(current, blockPatch, blockLocks);
    if (store.serviceBlocks.length) store.updateServiceBlock(0, mergedBlock);
    else store.addServiceBlock(mergedBlock);
    lastBlockAi.current = { ...lastBlockAi.current, ...Object.fromEntries(Object.keys(blockPatch).map((key) => [key, mergedBlock[key as keyof ServiceBlockInput]])) } as Partial<ServiceBlockInput>;
  }, [store]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((items) => [...items, { id: nextId.current++, role: 'user', text }]);
    setLoading(true);
    try {
      const response = await fetch('/api/ai-budget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, mode }) });
      const body = await response.json() as AiBudgetReply & { error?: string };
      if (!response.ok) throw new Error(body.error || 'No se pudo procesar la consulta');
      applyPatch(body);
      setMessages((items) => [...items, { id: nextId.current++, role: 'assistant', text: body.text, sources: body.sources, external: body.kind === 'normative' && !!body.sources?.length }]);
    } catch (error) {
      setMessages((items) => [...items, { id: nextId.current++, role: 'assistant', text: error instanceof Error ? error.message : 'No se pudo procesar la consulta.' }]);
    } finally { setLoading(false); }
  }, [applyPatch, input, loading, mode]);

  const copyMessage = useCallback(async (message: Message) => {
    const suffix = message.external ? `\n\n${LEGAL_DISCLAIMER}\n\n${EXTERNAL_SOURCE_DISCLAIMER}` : '';
    await navigator.clipboard.writeText(`${message.text}${suffix}`);
  }, []);

  const auditReady = useMemo(() => !!store.budgetTotals, [store.budgetTotals]);
  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant'),
    [messages],
  );
  if (stage === 'audit') return <AuditPanel onBack={() => setStage('compose')} />;
  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Flujo adicional · el presupuesto clásico permanece disponible</p>
          <h1 className="text-2xl font-semibold">Presupuesto con IA</h1>
        </div>
        <div className="flex items-center gap-2">
          {auditReady && <Button variant="outline" onClick={() => setStage('audit')}>Abrir revisión</Button>}
          <Button onClick={() => setAssistantOpen(true)} className="bg-emerald-700 hover:bg-emerald-800">
            <MessageSquare className="mr-2 h-4 w-4" />
            Abrir asistente
          </Button>
        </div>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="flex items-center gap-3 p-3">
          <Image
            src="/branding/gasito.png"
            alt="Gasito, asistente de GASI"
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
            priority
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <strong className="text-sm text-emerald-950">Gasito · preparación del presupuesto</strong>
              <Badge variant="outline" className="hidden bg-white text-[10px] sm:inline-flex">No modifica el motor</Badge>
            </div>
            <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-slate-700">
              {lastAssistantMessage?.text || 'Describe el servicio y prepararé los datos operativos para que los revises.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAssistantOpen(true)} className="shrink-0 bg-white">
            Conversar
          </Button>
        </CardContent>
      </Card>

      <div className="min-w-0 overflow-hidden rounded-xl border bg-gray-50">
        <BudgetForm embedded onCalculated={(_result: BudgetCalculationResult) => setStage('audit')} />
      </div>

      {assistantOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/25 backdrop-blur-[1px]" onMouseDown={() => setAssistantOpen(false)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Asistente para preparar el presupuesto"
            className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col border-l bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
              <Image
                src="/branding/gasito.png"
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-slate-950">Asistente de preparación</h2>
                <p className="text-xs text-slate-500">Prepara datos operativos; MediQuote mantiene el cálculo determinista.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setAssistantOpen(false)} aria-label="Cerrar asistente">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-5">
              <div className="space-y-5">
                {messages.map((message) => (
                  <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex items-start gap-2.5'}>
                    {message.role === 'assistant' && (
                      <Image
                        src="/branding/gasito.png"
                        alt=""
                        width={30}
                        height={30}
                        className="mt-1 h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    )}
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-[15px] leading-6 shadow-sm ${
                      message.role === 'user'
                        ? 'rounded-br-md bg-emerald-700 text-white'
                        : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                    }`}>
                      <div className="whitespace-pre-wrap break-words">{message.text}</div>
                      {message.sources?.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 block rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-950"
                        >
                          <strong>{source.title}</strong> · {source.organization}<br />
                          Publicación: {source.publishedAt || 'no indicada'} · Consulta: {source.consultedAt}<br />
                          {source.relevantSection || 'Apartado no indicado'} <ExternalLink className="inline h-3 w-3" />
                        </a>
                      ))}
                      {message.role === 'assistant' && (
                        <button onClick={() => void copyMessage(message)} className="mt-2 text-xs font-medium text-emerald-700 hover:underline">
                          Copiar respuesta
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-start gap-2.5">
                    <Image src="/branding/gasito.png" alt="" width={30} height={30} className="mt-1 h-7 w-7 rounded-full object-cover" />
                    <div className="rounded-2xl rounded-bl-md border bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">Consultando…</div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="shrink-0 border-t bg-white p-4">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(['auto', 'budget', 'normative'] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => setMode(value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      mode === value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {value === 'auto' ? 'Automático' : value === 'budget' ? 'Preparar presupuesto' : 'Consulta normativa'}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Describe el servicio con fechas, lugar, profesional y turnos…"
                  rows={4}
                  className="min-h-[104px] resize-none text-[15px] leading-6"
                  autoFocus
                />
                <Button onClick={() => void send()} disabled={loading || !input.trim()} size="icon" className="mb-1 h-10 w-10 shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 flex gap-2 text-[11px] leading-4 text-slate-600">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{LEGAL_DISCLAIMER}</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
