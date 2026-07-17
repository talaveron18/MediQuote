import { describe, expect, it } from 'vitest';
import { buildContractDraft, checkContractConsistency } from './contract';
import { DEMO_SNAPSHOT } from './demo-provider';

describe('contrato y coherencia', () => {
  it('detecta una discrepancia de precio como crítica', () => {
    const check = checkContractConsistency(DEMO_SNAPSHOT, buildContractDraft(DEMO_SNAPSHOT, true));
    expect(check.consistent).toBe(false); expect(check.issues.some((issue) => issue.field === 'precio_sin_iva' && issue.severity === 'critical')).toBe(true);
  });
  it('mantiene visibles los campos pendientes', () => {
    expect(buildContractDraft(DEMO_SNAPSHOT).pendingFields.length).toBeGreaterThan(0);
  });
});
