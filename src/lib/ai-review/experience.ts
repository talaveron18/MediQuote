import type {
  BudgetSnapshot, BudgetVersionComparison, DefenseView, HumanDecision, OperationalAnnex,
  ReviewBundle, ReviewerContradiction, ReviewFinding, ReviewIntegrityRecord, ReviewStatus,
} from './types';

export const DEMO_FLOW = ['Necesidad', 'Configuración', 'Cálculo', 'Revisión', 'Escenarios', 'Contrato', 'Aprobación'] as const;

export function allFindings(bundle: ReviewBundle | null): ReviewFinding[] {
  return bundle?.reviews.flatMap((review) => review.findings) ?? [];
}

export function effectiveVerdict(bundle: ReviewBundle | null, decisions: Record<string, HumanDecision>): ReviewStatus {
  if (!bundle) return 'apto_con_observaciones';
  const unresolved = allFindings(bundle).filter((finding) => decisions[finding.id]?.status !== 'resuelto');
  if (unresolved.some((finding) => finding.severity === 'critical')) return 'no_apto';
  if (unresolved.some((finding) => finding.requiresHumanValidation)) return 'apto_con_observaciones';
  return 'apto';
}

export function nextBestAction(bundle: ReviewBundle | null, decisions: Record<string, HumanDecision>, hasContract: boolean, coherent: boolean): string {
  if (!bundle) return 'Ejecute el Consejo para revisar el expediente desde cuatro perspectivas.';
  const critical = allFindings(bundle).find((finding) => finding.severity === 'critical' && decisions[finding.id]?.status !== 'resuelto');
  if (critical) return `Resuelva el bloqueo: ${critical.title}.`;
  const pending = allFindings(bundle).find((finding) => finding.requiresHumanValidation && !decisions[finding.id]);
  if (pending) return `Registre una decisión humana sobre: ${pending.title}.`;
  if (!hasContract) return 'Genere el borrador contractual y su anexo operativo.';
  if (!coherent) return 'Corrija la discrepancia contractual y repita la coherencia.';
  return 'El expediente está preparado para decisión humana final.';
}

export function buildDefense(snapshot: BudgetSnapshot, bundle: ReviewBundle): DefenseView {
  const cost = snapshot.baseCost + snapshot.pluses + snapshot.socialSecurity + snapshot.overhead;
  const margin = snapshot.priceExVat - cost;
  return {
    strongestGrounds: ['El cálculo económico procede de una foto determinista e inmutable.', 'Los cuatro ámbitos se han revisado por separado.', 'Los riesgos críticos no se promedian.'],
    coveredRisks: bundle.reviews.filter((review) => review.status !== 'no_apto').map((review) => `${review.label}: ${review.summary}`),
    favorableEvidence: [`Precio sin IVA: ${snapshot.priceExVat.toFixed(2)} €`, `Coste completo declarado: ${cost.toFixed(2)} €`, `Margen previo a contingencias: ${margin.toFixed(2)} €`],
    resolvableObjections: allFindings(bundle).filter((finding) => finding.severity !== 'critical').map((finding) => finding.title),
    priceDefense: margin > 0 ? 'El precio cubre el coste declarado y conserva margen para contingencias, sujeto a validar los costes omitidos.' : 'El precio no cubre el coste declarado y no puede defenderse.',
    approvalConditions: bundle.verdict.conditions,
  };
}

export function detectReviewerContradictions(bundle: ReviewBundle): ReviewerContradiction[] {
  const financeApproves = bundle.reviews.find((review) => review.reviewer === 'finanzas')?.status !== 'no_apto';
  const auditMissingCost = bundle.reviews.find((review) => review.reviewer === 'auditor')?.findings.some((finding) => /coste|festivo|cobertura/i.test(`${finding.title} ${finding.detail}`));
  const contradictions: ReviewerContradiction[] = [];
  if (financeApproves && auditMissingCost) contradictions.push({ id: 'contr-fin-audit', reviewers: ['finanzas', 'auditor'], statement: 'Finanzas acepta la foto económica mientras Auditoría identifica una omisión capaz de modificarla.', consequence: 'El dictamen financiero no puede considerarse definitivo hasta recalcular o justificar la omisión.', requiresHumanResolution: true });
  const laborOkay = bundle.reviews.find((review) => review.reviewer === 'gestoria')?.status === 'apto';
  const auditStaff = bundle.reviews.find((review) => review.reviewer === 'auditor')?.findings.some((finding) => /profesional|descanso|turno/i.test(`${finding.title} ${finding.detail}`));
  if (laborOkay && auditStaff) contradictions.push({ id: 'contr-labor-audit', reviewers: ['gestoria', 'auditor'], statement: 'Gestoría considera viable la plantilla, pero Auditoría cuestiona cobertura o descansos.', consequence: 'Debe prevalecer la comprobación de calendario hasta resolución humana.', requiresHumanResolution: true });
  return contradictions;
}

export function compareBudgetVersions(previous: BudgetSnapshot, current: BudgetSnapshot): BudgetVersionComparison {
  const money = (snapshot: BudgetSnapshot) => snapshot.baseCost + snapshot.pluses + snapshot.socialSecurity + snapshot.overhead;
  const fields: Array<keyof BudgetSnapshot> = ['professionalCategory', 'province', 'municipality', 'startDate', 'endDate', 'schedule', 'professionals', 'contractType', 'baseCost', 'pluses', 'socialSecurity', 'overhead', 'priceExVat'];
  const materialFields = new Set<keyof BudgetSnapshot>(['professionalCategory', 'province', 'municipality', 'startDate', 'endDate', 'schedule', 'professionals', 'contractType', 'baseCost', 'pluses', 'socialSecurity', 'overhead', 'priceExVat']);
  const changes = fields.filter((field) => previous[field] !== current[field]).map((field) => ({ field, before: String(previous[field]), after: String(current[field]), material: materialFields.has(field) }));
  return { stale: changes.some((change) => change.material), changes, previousCost: money(previous), currentCost: money(current), previousPrice: previous.priceExVat, currentPrice: current.priceExVat, reviewRequired: changes.some((change) => change.material) };
}

export function buildOperationalAnnex(snapshot: BudgetSnapshot): OperationalAnnex {
  return {
    reference: snapshot.reference,
    generatedAt: new Date().toISOString(),
    sections: [
      { heading: 'Servicio y ubicación', text: `${snapshot.professionalCategory} en ${snapshot.municipality}, ${snapshot.province}.` },
      { heading: 'Cobertura', text: `${snapshot.professionals} profesional(es), del ${snapshot.startDate} al ${snapshot.endDate}; ${snapshot.schedule}.` },
      { heading: 'Sustituciones', text: 'GASI coordinará cualquier sustitución previa validación de habilitación, coste y descanso.' },
      { heading: 'Escalado', text: 'Incidencia → coordinador GASI → responsable del cliente → dirección, según gravedad.' },
    ],
    included: ['Cobertura descrita', 'Coordinación ordinaria', 'Registro de incidencias'],
    excluded: ['Ampliaciones no autorizadas', 'Material no presupuestado', 'Coberturas fuera del calendario'],
    pendingFields: ['Interlocutor del cliente', 'Tiempo máximo de sustitución', 'Canal de urgencias'],
  };
}

export function visibleFinancials(snapshot: BudgetSnapshot, view: 'ejecutiva' | 'tecnica' | 'cliente') {
  if (view === 'cliente') return { priceExVat: snapshot.priceExVat, vatPercent: snapshot.vatPercent, totalWithVat: snapshot.totalWithVat };
  const cost = snapshot.baseCost + snapshot.pluses + snapshot.socialSecurity + snapshot.overhead;
  return { priceExVat: snapshot.priceExVat, vatPercent: snapshot.vatPercent, totalWithVat: snapshot.totalWithVat, cost, margin: snapshot.priceExVat - cost };
}

export function demoMetrics(bundle: ReviewBundle | null, decisions: Record<string, HumanDecision>, coherent: boolean, hasAnnex: boolean) {
  const findings = allFindings(bundle);
  const resolved = findings.filter((finding) => decisions[finding.id]?.status === 'resuelto').length;
  return { perspectives: bundle?.reviews.length ?? 0, risks: findings.length, resolved, pendingCritical: findings.filter((finding) => finding.severity === 'critical' && decisions[finding.id]?.status !== 'resuelto').length, decisions: Object.keys(decisions).length, coherent, checkedArtifacts: (coherent ? 1 : 0) + (hasAnnex ? 1 : 0), automaticChanges: 0 };
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildIntegrityRecord(snapshot: BudgetSnapshot, bundle: ReviewBundle, decisions: Record<string, HumanDecision>, version = 1): Promise<ReviewIntegrityRecord> {
  const base = { budgetReference: snapshot.reference, version, generatedAt: new Date().toISOString(), mode: bundle.mode, reviewers: bundle.reviews.map((review) => review.reviewer), verdict: bundle.verdict.status, findings: allFindings(bundle).length, decisions: Object.values(decisions), disclaimer: 'Registro técnico verificable. No es firma electrónica, certificado ni dictamen legal.' };
  return { ...base, inputHash: await sha256(snapshot), outputHash: await sha256({ bundle, decisions }) };
}
