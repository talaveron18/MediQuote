import type { BudgetSnapshot, ReviewBundle, ServiceIntakeDraft, SpecialistReview } from './types';
import { buildJointVerdict, buildProsecutorView } from './verdict';
import { buildDefense, detectReviewerContradictions } from './experience';
import type { EvidenceSourceType, RiskCategory } from './types';

export const DEMO_INTAKE_TEXT = `Necesitamos un enfermero para una residencia en Toledo, de lunes a viernes de 08:00 a 16:00, desde el 1 de septiembre hasta el 30 de noviembre de 2026. Contrato temporal. Un profesional. El cliente pide precio cerrado.`;

export const DEMO_SNAPSHOT: BudgetSnapshot = {
  reference: 'DEMO-GASI-2026-001', clientName: 'Residencia Demo La Vega', professionalCategory: 'Enfermería',
  autonomousCommunity: 'Castilla-La Mancha', province: 'Toledo', municipality: 'Toledo',
  startDate: '2026-09-01', endDate: '2026-11-30', schedule: 'Lunes a viernes, 08:00–16:00', professionals: 1,
  contractType: 'Temporal por circunstancias de la producción (pendiente de causa)', baseCost: 11840,
  pluses: 840, socialSecurity: 4280, overhead: 2535, priceExVat: 29400, vatPercent: 0,
  totalWithVat: 29400, annualProductiveHours: 1760,
};

export function demoIntake(text: string): ServiceIntakeDraft {
  const lower = text.toLocaleLowerCase('es');
  return {
    clientName: lower.includes('residencia') ? 'Residencia (nombre pendiente)' : 'Cliente pendiente de confirmar',
    professionalCategory: lower.includes('médic') || lower.includes('medic') ? 'Medicina' : 'Enfermería',
    autonomousCommunity: lower.includes('toledo') ? 'Castilla-La Mancha' : 'Pendiente',
    province: lower.includes('toledo') ? 'Toledo' : 'Pendiente', municipality: lower.includes('toledo') ? 'Toledo' : 'Pendiente',
    startDate: lower.includes('septiembre') ? '2026-09-01' : 'Pendiente',
    endDate: lower.includes('noviembre') ? '2026-11-30' : 'Pendiente',
    schedule: lower.includes('08:00') ? 'Lunes a viernes, 08:00–16:00' : 'Pendiente de confirmar',
    professionals: /dos|2 profesionales/.test(lower) ? 2 : 1,
    contractType: lower.includes('temporal') ? 'Temporal (causa pendiente de validar)' : 'Pendiente', notes: text.slice(0, 500),
    pendingConfirmation: ['Causa legal de temporalidad', 'Convenio provincial vigente', 'Festivos municipales del centro', 'Tratamiento de ausencias y sustituciones'],
  };
}

function finding(id: string, title: string, detail: string, severity: 'info' | 'warning' | 'high' | 'critical', recommendation: string, riskCategory: RiskCategory, evidenceSource: EvidenceSourceType = 'presupuesto') {
  return { id, title, detail, severity, evidence: ['Foto económica del presupuesto', 'Datos del servicio declarados'], evidenceSource, whyDetected: detail, riskCategory, impact: severity === 'critical' ? 'critico' as const : severity === 'high' ? 'alto' as const : 'medio' as const, probability: 'no_evaluable' as const, responsible: riskCategory === 'financiero' ? 'Dirección financiera' : riskCategory === 'contractual' || riskCategory === 'datos_privacidad' ? 'Responsable legal' : 'Operaciones y gestoría', dependency: 'Validación humana y evidencia documental', recommendation, requiresHumanValidation: severity !== 'info' };
}

export function demoReviews(snapshot: BudgetSnapshot): SpecialistReview[] {
  return [
    {
      reviewer: 'gestoria', label: 'Gestoría laboral', status: 'apto_con_observaciones', demo: true,
      summary: 'La estructura laboral es plausible, pero faltan comprobaciones documentales antes de contratar.',
      assumptions: ['Pagas extra prorrateadas', 'Vacaciones incluidas en la planificación', 'Causa temporal válida'],
      findings: [finding('ges-vacaciones', 'Cobertura de vacaciones y ausencias', 'El precio no acredita una bolsa específica de sustitución ni el calendario de vacaciones.', 'warning', 'Contrastar con la gestoría el coste real de sustitución y documentar la causa contractual.', 'laboral', 'regla_empresa')],
    },
    {
      reviewer: 'finanzas', label: 'Finanzas', status: 'apto_con_observaciones', demo: true,
      summary: 'El margen base es positivo, pero sensible al absentismo y a errores de coste laboral.',
      assumptions: ['El precio permanece cerrado', 'No hay impagos', 'No aparecen pluses no presupuestados'],
      findings: [finding('fin-absentismo', 'Sensibilidad al absentismo', `El coste base declarado es ${snapshot.baseCost.toFixed(2)} € y no incluye un escenario explícito de absentismo.`, 'high', 'Auditar el escenario del 3–8 % y fijar un umbral mínimo de margen antes de emitir.', 'financiero', 'motor')],
    },
    {
      reviewer: 'auditor', label: 'Auditor operativo', status: 'no_apto', demo: true,
      summary: 'Hay una condición de cobertura que debe resolverse antes de considerar la propuesta operativamente segura.',
      assumptions: ['Un solo profesional cubre todo el periodo', 'No existe solape automático', 'Calendario territorial completo'],
      findings: [
        finding('aud-turno', 'Continuidad del turno y descansos', 'Un único profesional durante todo el periodo deja el servicio expuesto a descansos, ausencias e incidencias.', 'critical', 'Definir cobertura de relevo y probar el calendario completo con la plantilla mínima.', 'operativo', 'motor'),
        finding('aud-festivos', 'Festivos territoriales y municipales', `El servicio se presta en ${snapshot.municipality}; debe aplicarse únicamente su calendario nacional, autonómico, provincial y municipal.`, 'high', 'Confirmar los dos festivos locales y el convenio aplicable a Toledo.', 'documental', 'presupuesto'),
      ],
    },
    {
      reviewer: 'legal', label: 'Legal y cumplimiento', status: 'apto_con_observaciones', demo: true,
      summary: 'El borrador requiere causa contractual, reparto de responsabilidades y protección de datos.',
      assumptions: ['No se cede personal de forma ilícita', 'GASI conserva dirección organizativa', 'No se incluyen datos clínicos en la IA'],
      findings: [
        finding('leg-control', 'Dirección y control operativo', 'La relación con el cliente debe evitar instrucciones directas que desdibujen quién organiza el trabajo.', 'high', 'Definir por contrato la interlocución, coordinación y facultades organizativas de GASI.', 'contractual', 'contrato'),
        finding('leg-datos', 'Protección de datos sanitarios', 'No consta si el profesional tratará datos de salud por cuenta del cliente.', 'warning', 'Determinar roles RGPD y formalizar encargo de tratamiento si corresponde.', 'datos_privacidad', 'usuario'),
      ],
    },
  ];
}

export function buildDemoBundle(snapshot: BudgetSnapshot): ReviewBundle {
  const reviews = demoReviews(snapshot);
  const base = { mode: 'demo' as const, generatedAt: new Date().toISOString(), reviews, verdict: buildJointVerdict(reviews), prosecutor: buildProsecutorView(reviews) };
  return { ...base, defense: buildDefense(snapshot, base), contradictions: detectReviewerContradictions(base) };
}
