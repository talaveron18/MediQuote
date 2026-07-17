import type { JointVerdict, ProsecutorView, SpecialistReview } from './types';

export function buildJointVerdict(reviews: SpecialistReview[]): JointVerdict {
  const findings = reviews.flatMap((review) => review.findings);
  const critical = findings.filter((finding) => finding.severity === 'critical');
  const high = findings.filter((finding) => finding.severity === 'high');
  const status = critical.length > 0
    ? 'no_apto'
    : high.length > 0 || findings.some((finding) => finding.severity === 'warning')
      ? 'apto_con_observaciones'
      : 'apto';
  return {
    status,
    headline: status === 'no_apto'
      ? 'No debe emitirse hasta resolver los bloqueos críticos.'
      : status === 'apto_con_observaciones'
        ? 'Puede continuar si una persona valida las condiciones señaladas.'
        : 'No se han detectado bloqueos en la revisión disponible.',
    criticalCount: critical.length,
    highCount: high.length,
    blockingFindingIds: critical.map((finding) => finding.id),
    conditions: findings.filter((finding) => finding.requiresHumanValidation).map((finding) => finding.recommendation),
  };
}

export function buildProsecutorView(reviews: SpecialistReview[]): ProsecutorView {
  const findings = reviews.flatMap((review) => review.findings);
  const strongest = findings.find((finding) => finding.severity === 'critical')
    ?? findings.find((finding) => finding.severity === 'high')
    ?? findings[0];
  return {
    accusation: strongest?.title ?? 'La propuesta depende de supuestos que no han sido contrastados.',
    weakestAssumption: strongest?.detail ?? 'La precisión de los datos de entrada y de sus fuentes.',
    worstReasonableCase: 'Una desviación laboral o una cobertura insuficiente elimina el margen y obliga a asumir el sobrecoste.',
    evidenceToRequest: ['Nómina o simulación de gestoría', 'Convenio aplicable y tablas vigentes', 'Calendario y cobertura real firmados'],
    finalChallenge: '¿Firmarías este presupuesto si el coste real aumentara un 8 % mañana? Si no, falta una condición de protección.',
  };
}
