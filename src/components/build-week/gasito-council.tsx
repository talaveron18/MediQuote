import type { ComponentType } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Calculator, ClipboardList, FileSearch, HeartPulse, Scale, Stethoscope, Tablet,
  WifiOff,
} from 'lucide-react';
import type { ReviewBundle } from '@/lib/ai-review/types';
import {
  actorAriaLabel, councilAnimationPlan, GASITO_ACTORS, GASITO_STATE_LABELS, motionForState,
  type GasitoActorState, type GasitoRole,
} from '@/lib/ai-review/gasito-actors';
import styles from './gasito-council.module.css';

const toolByRole: Record<GasitoRole, ComponentType<{ className?: string }>> = {
  moderador: Stethoscope,
  gestoria: ClipboardList,
  finanzas: Calculator,
  auditor: FileSearch,
  legal: Scale,
};

const accentClass = {
  blue: styles.accentBlue,
  green: styles.accentGreen,
  navy: styles.accentNavy,
  orange: styles.accentOrange,
  violet: styles.accentViolet,
};

type GasitoFigureProps = {
  role: GasitoRole;
  state: GasitoActorState;
  active?: boolean;
  target?: boolean;
  compact?: boolean;
};

export function GasitoFigure({ role, state, active = false, target = false, compact = false }: GasitoFigureProps) {
  const actor = GASITO_ACTORS.find((item) => item.role === role) ?? GASITO_ACTORS[0];
  const Tool = toolByRole[role];
  const motion = motionForState(state, active);
  return (
    <div
      className={`${styles.figure} ${accentClass[actor.accent]} ${styles[`motion${motion[0].toUpperCase()}${motion.slice(1)}`]} ${state === 'no_disponible' ? styles.offline : ''} ${target ? styles.target : ''} ${compact ? 'scale-75' : ''}`}
      data-gasito-role={role}
      data-gasito-state={state}
      data-motion={motion}
      aria-label={actorAriaLabel(role, state, active)}
      role="img"
    >
      <span className={styles.halo} />
      <span className={styles.armLeft} />
      <span className={styles.armRight} />
      <span className={styles.body}><span className={styles.roleBand} /><span className={styles.chest}>+</span></span>
      <span className={styles.head}><span className={styles.visor}><span className={styles.eyes} /></span></span>
      <span className={styles.footLeft} /><span className={styles.footRight} />
      <span className={styles.tool} aria-hidden="true"><Tool className="h-4 w-4" /></span>
    </div>
  );
}

function stateForReviewer(bundle: ReviewBundle | null, role: Exclude<GasitoRole, 'moderador'>, index: number, stage: number): GasitoActorState {
  const review = bundle?.reviews.find((item) => item.reviewer === role);
  if (!review && bundle) return 'no_disponible';
  if (!review) return stage === index ? 'revisando' : 'esperando';
  if (review.status === 'no_apto' || review.findings.some((finding) => finding.severity === 'critical')) return 'con_hallazgos';
  return review.status === 'apto' ? 'de_acuerdo' : 'completado';
}

export function GasitoCouncil({ bundle, stage, onEvidence }: { bundle: ReviewBundle | null; stage: number; onEvidence?: (findingId: string) => void }) {
  const reviewerRoles: Array<Exclude<GasitoRole, 'moderador'>> = ['gestoria', 'finanzas', 'auditor', 'legal'];
  const contradiction = Boolean(bundle?.contradictions?.length);
  const activeRole: GasitoRole | null = !bundle && stage >= 0 && stage < reviewerRoles.length
    ? reviewerRoles[stage]
    : contradiction ? 'auditor' : null;
  const targetRole: GasitoRole | null = contradiction ? 'gestoria' : null;
  const plan = councilAnimationPlan(activeRole, targetRole);

  return (
    <div className="space-y-4" data-testid="gasito-council">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {GASITO_ACTORS.map((actor) => {
          const reviewerIndex = reviewerRoles.indexOf(actor.role as Exclude<GasitoRole, 'moderador'>);
          const review = actor.role === 'moderador' ? null : bundle?.reviews.find((item) => item.reviewer === actor.role);
          const state: GasitoActorState = actor.role === 'moderador'
            ? bundle ? contradiction ? 'en_desacuerdo' : 'completado' : stage >= 0 ? 'revisando' : 'esperando'
            : stateForReviewer(bundle, actor.role, reviewerIndex, stage);
          const animation = plan.find((item) => item.role === actor.role);
          const principal = review?.findings[0];
          return (
            <Card key={actor.role} className={`relative overflow-hidden py-4 ${animation?.target ? 'ring-2 ring-orange-300' : ''}`} data-testid={`actor-${actor.role}`}>
              <CardContent className="flex h-full flex-col items-center text-center">
                <GasitoFigure role={actor.role} state={state} active={animation?.primary} target={animation?.target} />
                <h3 className="mt-1 font-bold text-slate-950">{actor.name}</h3>
                <p className="min-h-8 text-xs text-slate-500">{actor.specialty}</p>
                <Badge className="mt-2" variant={state === 'con_hallazgos' || state === 'en_desacuerdo' ? 'destructive' : 'outline'}>
                  {state === 'no_disponible' && <WifiOff className="mr-1 h-3 w-3" />}{GASITO_STATE_LABELS[state]}
                </Badge>
                <div className="mt-3 min-h-14 text-xs text-slate-600">
                  {actor.role === 'moderador' ? <><b>No vota.</b><br />Ordena el debate y propone la siguiente acción.</> : review ? <><b>Voto:</b> {review.status.replaceAll('_', ' ')}<br />{principal?.title}</> : 'A la espera de intervenir.'}
                </div>
                {principal && onEvidence && <Button size="sm" variant="ghost" className="mt-auto" onClick={() => onEvidence(principal.id)}><FileSearch /> Evidencia</Button>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {contradiction && (
        <div className="relative rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm" aria-label="Interacción entre revisores">
          <div className="flex flex-wrap items-center gap-2 font-semibold text-orange-950">
            <FileSearch className="h-4 w-4" /> Gasito Auditor <span aria-hidden="true">→</span> Gasito Gestoría
          </div>
          <p className="mt-1 text-orange-900">¿Está confirmada la cobertura de relevo? No existe evidencia suficiente en el expediente.</p>
          <p className="mt-2 flex items-center gap-2 text-xs text-slate-600"><HeartPulse className="h-4 w-4 text-blue-700" /><b>Gasito resume:</b> el Consejo requiere una decisión humana antes de continuar.</p>
        </div>
      )}
    </div>
  );
}

export function GasitoContextual({ text, complete, busy, onAction }: { text: string; complete: boolean; busy: boolean; onAction: () => void }) {
  return (
    <div className="grid items-center gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-3 sm:grid-cols-[86px_1fr_auto]" data-testid="gasito-contextual">
      <div className="h-[76px] overflow-hidden"><GasitoFigure role="moderador" state={complete ? 'completado' : busy ? 'revisando' : 'esperando'} active={busy} compact /></div>
      <div className="text-sm"><p className="font-bold text-blue-950">Gasito recomienda</p><p className="text-slate-700">{complete ? 'El expediente ya no tiene bloqueos y está preparado para decisión humana.' : text}</p><p className="mt-1 text-xs text-slate-500"><b>Origen:</b> Consejo de revisión · <b>Acción:</b> {complete ? 'revisar cierre' : 'continuar el flujo guiado'}</p></div>
      <Button size="sm" onClick={onAction} disabled={busy}>{busy ? 'Revisando…' : complete ? 'Ver cierre' : 'Continuar'}<Tablet /></Button>
    </div>
  );
}
