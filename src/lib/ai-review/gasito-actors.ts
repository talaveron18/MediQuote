export type GasitoRole = 'moderador' | 'gestoria' | 'finanzas' | 'auditor' | 'legal';

export type GasitoActorState =
  | 'esperando'
  | 'revisando'
  | 'con_hallazgos'
  | 'de_acuerdo'
  | 'en_desacuerdo'
  | 'no_disponible'
  | 'completado';

export type GasitoMotion = 'idle' | 'primary' | 'finding' | 'agree' | 'disagree' | 'offline' | 'complete';

export const GASITO_ACTORS = [
  { role: 'moderador', name: 'Gasito', specialty: 'Moderador del Consejo', accent: 'blue', votes: false },
  { role: 'gestoria', name: 'Gasito Gestoría', specialty: 'Personal y costes laborales', accent: 'green', votes: true },
  { role: 'finanzas', name: 'Gasito Finanzas', specialty: 'Viabilidad económica', accent: 'navy', votes: true },
  { role: 'auditor', name: 'Gasito Auditor', specialty: 'Riesgos, evidencia y control', accent: 'orange', votes: true },
  { role: 'legal', name: 'Gasito Legal', specialty: 'Riesgo legal y contractual', accent: 'violet', votes: true },
] as const satisfies ReadonlyArray<{
  role: GasitoRole;
  name: string;
  specialty: string;
  accent: 'blue' | 'green' | 'navy' | 'orange' | 'violet';
  votes: boolean;
}>;

export const GASITO_STATE_LABELS: Record<GasitoActorState, string> = {
  esperando: 'Esperando',
  revisando: 'Revisando',
  con_hallazgos: 'Con hallazgos',
  de_acuerdo: 'De acuerdo',
  en_desacuerdo: 'En desacuerdo',
  no_disponible: 'No disponible',
  completado: 'Completado',
};

export function motionForState(state: GasitoActorState, active = false): GasitoMotion {
  if (state === 'no_disponible') return 'offline';
  if (active || state === 'revisando') return 'primary';
  if (state === 'con_hallazgos') return 'finding';
  if (state === 'de_acuerdo') return 'agree';
  if (state === 'en_desacuerdo') return 'disagree';
  if (state === 'completado') return 'complete';
  return 'idle';
}

export function actorAriaLabel(role: GasitoRole, state: GasitoActorState, active = false) {
  const actor = GASITO_ACTORS.find((item) => item.role === role);
  return `${actor?.name ?? 'Gasito'}: ${GASITO_STATE_LABELS[state]}${active ? ', intervención activa' : ''}`;
}

export function councilAnimationPlan(activeRole: GasitoRole | null, targetRole: GasitoRole | null = null) {
  return GASITO_ACTORS.map((actor) => ({
    role: actor.role,
    primary: actor.role === activeRole,
    target: actor.role === targetRole,
  }));
}
