import type { ReviewerRole, SpecialistReview } from './types';
import { REVIEWER_ROLES } from './types';

export function completeReviewerSet(partial: Partial<Record<ReviewerRole, SpecialistReview>>): SpecialistReview[] {
  return REVIEWER_ROLES.map((role) => partial[role] ?? ({
    reviewer: role,
    label: role === 'gestoria' ? 'Gestoría laboral' : role === 'finanzas' ? 'Finanzas' : role === 'auditor' ? 'Auditor operativo' : 'Legal y cumplimiento',
    status: 'no_apto', demo: false,
    summary: 'Este revisor no pudo completar su análisis. Los demás resultados se conservan, pero el dictamen queda bloqueado.',
    assumptions: [],
    findings: [{ id: `reviewer-failed-${role}`, title: 'Revisión especializada incompleta', detail: `El revisor ${role} falló o devolvió una estructura inválida.`, severity: 'critical', evidence: ['Estado técnico del proveedor'], evidenceSource: 'supuesto_ia', whyDetected: 'No existe una respuesta especializada válida para esta perspectiva.', riskCategory: role === 'finanzas' ? 'financiero' : role === 'legal' ? 'contractual' : role === 'gestoria' ? 'laboral' : 'operativo', impact: 'critico', probability: 'no_evaluable', responsible: 'Administrador técnico', dependency: 'Reintento del proveedor o revisión humana equivalente', recommendation: 'Reintentar exclusivamente este revisor o completar la revisión manual antes de aprobar.', requiresHumanValidation: true }],
  }));
}
