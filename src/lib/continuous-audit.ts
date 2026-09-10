export type GestoriaComponentKey =
  | 'salary'
  | 'pluses'
  | 'socialSecurity'
  | 'occupationalRisk'
  | 'contractCosts';

export type InternalComponentKey =
  | 'overhead'
  | 'directCosts'
  | 'commercialCommission'
  | 'gasiBenefit';

export type AuditComponentKey = GestoriaComponentKey | InternalComponentKey;
export type AuditBreakdown = Partial<Record<AuditComponentKey, number>>;
export type GestoriaBreakdown = Partial<Record<GestoriaComponentKey, number>>;
export type InternalBreakdown = Partial<Record<InternalComponentKey, number>>;

export const GESTORIA_COMPONENT_LABELS: Record<GestoriaComponentKey, string> = {
  salary: 'Salario y pagas extra',
  pluses: 'Pluses',
  socialSecurity: 'Seguridad Social',
  occupationalRisk: 'AT/EP',
  contractCosts: 'Contratación, gestoría y finalización',
};

export const INTERNAL_COMPONENT_LABELS: Record<InternalComponentKey, string> = {
  overhead: 'Overhead GASI',
  directCosts: 'Otros costes internos/directos',
  commercialCommission: 'Comisión comercial',
  gasiBenefit: 'Resultado imputado a GASI',
};

export const AUDIT_COMPONENT_LABELS: Record<AuditComponentKey, string> = {
  ...GESTORIA_COMPONENT_LABELS,
  ...INTERNAL_COMPONENT_LABELS,
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function estimatedBreakdownFromSnapshot(snapshot: string): {
  total: number;
  gestoriaTotal: number;
  internalTotal: number;
  breakdown: AuditBreakdown;
  gestoriaBreakdown: GestoriaBreakdown;
  internalBreakdown: InternalBreakdown;
} {
  const parsed = JSON.parse(snapshot);
  const internal = parsed?.internalCost;
  if (!internal || !Number.isFinite(Number(internal.totalInternalCost))) {
    throw new Error('La cotización no contiene un coste interno auditable');
  }

  const hasLaborBlocks = Array.isArray(internal.laborBlocks);
  const blocks = hasLaborBlocks ? internal.laborBlocks : [internal];
  const sum = (reader: (block: any) => number) => round(blocks.reduce(
    (total: number, block: any) => total + Number(reader(block) || 0), 0,
  ));

  const gestoriaBreakdown: GestoriaBreakdown = {
    salary: sum((block) => block?.labor?.salaryForService),
    pluses: sum((block) => block?.labor?.totalPluses),
    socialSecurity: sum((block) => block?.labor?.totalEmployerContributions),
    occupationalRisk: sum((block) => block?.labor?.totalOccupationalRisk),
    contractCosts: sum((block) => Number(block?.managementCost || 0)
      + Number(block?.terminationProvision || 0)
      + Number(block?.otherContractCosts || 0)),
  };

  // New aggregate snapshots keep labor blocks and top-level direct costs separately.
  // Legacy/single-block snapshots keep totalDirectCosts on the block itself. Never add
  // both representations of the same value or the audit will silently double count it.
  const directCosts = hasLaborBlocks
    ? Number(internal.directCostTotal || 0)
    : sum((block) => block?.totalDirectCosts);
  const directCostOverhead = hasLaborBlocks ? Number(internal.directCostOverhead || 0) : 0;
  const internalBreakdown: InternalBreakdown = {
    overhead: round(sum((block) => block?.overhead) + directCostOverhead),
    directCosts: round(directCosts),
    commercialCommission: round(Number(parsed?.commercial?.commissionAmount || 0)),
    gasiBenefit: round(Number(parsed?.commercial?.finalGasiBenefit || 0)),
  };

  const gestoriaTotal = round(Object.values(gestoriaBreakdown).reduce((total, value) => total + Number(value || 0), 0));
  const internalTotal = round(Object.values(internalBreakdown).reduce((total, value) => total + Number(value || 0), 0));

  return {
    total: round(Number(internal.totalInternalCost)),
    gestoriaTotal,
    internalTotal,
    breakdown: { ...gestoriaBreakdown, ...internalBreakdown },
    gestoriaBreakdown,
    internalBreakdown,
  };
}

export type ReconciliationStatus = 'match' | 'mismatch' | 'not_provided';

export function calculateAuditDeviation(params: {
  estimatedCost: number;
  actualCost: number;
  estimatedBreakdown: AuditBreakdown;
  actualBreakdown?: GestoriaBreakdown;
}) {
  const deviationAmount = round(params.actualCost - params.estimatedCost);
  const deviationPercent = params.estimatedCost > 0
    ? round(deviationAmount / params.estimatedCost * 100)
    : 0;

  const analysis = (Object.keys(GESTORIA_COMPONENT_LABELS) as GestoriaComponentKey[])
    .map((key) => {
      const estimated = round(Number(params.estimatedBreakdown[key] || 0));
      const supplied = params.actualBreakdown?.[key];
      if (!Number.isFinite(Number(supplied))) {
        return {
          key,
          label: GESTORIA_COMPONENT_LABELS[key],
          estimated,
          actual: null,
          deviationAmount: null,
          deviationPercent: null,
          status: 'not_provided' as ReconciliationStatus,
        };
      }
      const actual = round(Number(supplied));
      const amount = round(actual - estimated);
      return {
        key,
        label: GESTORIA_COMPONENT_LABELS[key],
        estimated,
        actual,
        deviationAmount: amount,
        deviationPercent: estimated > 0 ? round(amount / estimated * 100) : 0,
        status: (amount === 0 ? 'match' : 'mismatch') as ReconciliationStatus,
      };
    });

  const internalAnalysis = (Object.keys(INTERNAL_COMPONENT_LABELS) as InternalComponentKey[])
    .map((key) => ({
      key,
      label: INTERNAL_COMPONENT_LABELS[key],
      amount: round(Number(params.estimatedBreakdown[key] || 0)),
      status: 'internal' as const,
    }));

  return { deviationAmount, deviationPercent, analysis, internalAnalysis };
}
