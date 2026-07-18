import { describe, expect, it } from 'vitest';
import { buildContractDraft, checkArtifactConsistency } from './contract';
import { buildDemoBundle, demoIntake, DEMO_INTAKE_TEXT, DEMO_SNAPSHOT } from './demo-provider';
import {
  allFindings, buildIntegrityRecord, buildOperationalAnnex, compareBudgetVersions, demoMetrics,
  detectReviewerContradictions, effectiveVerdict, visibleFinancials,
} from './experience';
import { calculateScenario } from './scenarios';
import type { HumanDecision } from './types';

describe('flujo completo Build Week', () => {
  it('recorre intake, consejo, decisión, escenario, contrato, corrección e integridad', async () => {
    const draft = demoIntake(DEMO_INTAKE_TEXT);
    expect(draft.municipality).toBe('Toledo');
    const bundle = buildDemoBundle(DEMO_SNAPSHOT);
    expect(bundle.reviews).toHaveLength(4);
    expect(effectiveVerdict(bundle, {})).toBe('no_apto');
    const critical = allFindings(bundle).find((finding) => finding.severity === 'critical');
    expect(critical).toBeDefined();
    const decisions: Record<string, HumanDecision> = { [critical!.id]: { findingId: critical!.id, status: 'resuelto', comment: 'Cobertura confirmada', decidedAt: new Date(0).toISOString(), decidedBy: 'Test' } };
    expect(effectiveVerdict(bundle, decisions)).toBe('apto_con_observaciones');
    expect(calculateScenario(DEMO_SNAPSHOT, 'absentismo', 8).adjustedMargin).toBeLessThan(calculateScenario(DEMO_SNAPSHOT, 'absentismo', 0).adjustedMargin);
    const annex = buildOperationalAnnex(DEMO_SNAPSHOT);
    expect(checkArtifactConsistency(DEMO_SNAPSHOT, buildContractDraft(DEMO_SNAPSHOT, true), annex).consistent).toBe(false);
    expect(checkArtifactConsistency(DEMO_SNAPSHOT, buildContractDraft(DEMO_SNAPSHOT, false), annex).consistent).toBe(true);
    const record = await buildIntegrityRecord(DEMO_SNAPSHOT, bundle, decisions);
    expect(record.inputHash).toMatch(/^[a-f0-9]{64}$/); expect(record.outputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('mantiene costes y margen fuera de la vista cliente', () => {
    const client = visibleFinancials(DEMO_SNAPSHOT, 'cliente');
    expect(client).not.toHaveProperty('cost'); expect(client).not.toHaveProperty('margin');
    expect(visibleFinancials(DEMO_SNAPSHOT, 'tecnica')).toHaveProperty('cost');
  });

  it('marca dictámenes desactualizados tras cualquier cambio material', () => {
    const changed = { ...DEMO_SNAPSHOT, schedule: 'Lunes a viernes 08:00–18:00' };
    const comparison = compareBudgetVersions(DEMO_SNAPSHOT, changed);
    expect(comparison.stale).toBe(true); expect(comparison.reviewRequired).toBe(true);
  });

  it('expone el desacuerdo entre Finanzas y Auditoría', () => {
    expect(detectReviewerContradictions(buildDemoBundle(DEMO_SNAPSHOT)).some((item) => item.reviewers.includes('finanzas') && item.reviewers.includes('auditor'))).toBe(true);
  });

  it('calcula métricas desde el estado real de la sesión', () => {
    const bundle = buildDemoBundle(DEMO_SNAPSHOT);
    const metrics = demoMetrics(bundle, {}, false, false);
    expect(metrics.perspectives).toBe(4); expect(metrics.risks).toBe(allFindings(bundle).length); expect(metrics.automaticChanges).toBe(0);
  });
});
