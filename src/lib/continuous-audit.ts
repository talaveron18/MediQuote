export type AuditComponentKey =
  | 'salary'
  | 'pluses'
  | 'socialSecurity'
  | 'occupationalRisk'
  | 'contractCosts'
  | 'overhead'
  | 'directCosts';

export type AuditBreakdown = Partial<Record<AuditComponentKey, number>>;

export const AUDIT_COMPONENT_LABELS: Record<AuditComponentKey, string> = {
  salary: 'Salario y pagas extra',
  pluses: 'Pluses',
  socialSecurity: 'Seguridad Social',
  occupationalRisk: 'AT/EP',
  contractCosts: 'Contratación, gestoría y finalización',
  overhead: 'Overhead',
  directCosts: 'Otros costes directos',
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function estimatedBreakdownFromSnapshot(snapshot: string): {
  total: number;
  breakdown: AuditBreakdown;
} {
  const parsed = JSON.parse(snapshot);
  const internal = parsed?.internalCost;
  if (!internal || !Number.isFinite(Number(internal.totalInternalCost))) {
    throw new Error('La cotización no contiene un coste interno auditable');
  }
  const blocks = Array.isArray(internal.laborBlocks) ? internal.laborBlocks : [];
  const sum = (reader: (block: any) => number) => round(blocks.reduce(
    (total: number, block: any) => total + Number(reader(block) || 0), 0,
  ));
  const directCostTotal = Number(internal.directCostTotal || 0);
  const directCostOverhead = Number(internal.directCostOverhead || 0);
  return {
    total: round(Number(internal.totalInternalCost)),
    breakdown: {
      salary: sum((block) => block?.labor?.salaryForService),
      pluses: sum((block) => block?.labor?.totalPluses),
      socialSecurity: sum((block) => block?.labor?.totalEmployerContributions),
      occupationalRisk: sum((block) => block?.labor?.totalOccupationalRisk),
      contractCosts: sum((block) => Number(block?.managementCost || 0)
        + Number(block?.terminationProvision || 0)
        + Number(block?.otherContractCosts || 0)),
      overhead: round(sum((block) => block?.overhead) + directCostOverhead),
      directCosts: round(sum((block) => block?.totalDirectCosts) + directCostTotal),
    },
  };
}

export function calculateAuditDeviation(params: {
  estimatedCost: number;
  actualCost: number;
  estimatedBreakdown: AuditBreakdown;
  actualBreakdown?: AuditBreakdown;
}) {
  const deviationAmount = round(params.actualCost - params.estimatedCost);
  const deviationPercent = params.estimatedCost > 0
    ? round(deviationAmount / params.estimatedCost * 100)
    : 0;
  const analysis = (Object.keys(AUDIT_COMPONENT_LABELS) as AuditComponentKey[])
    .filter((key) => Number.isFinite(Number(params.actualBreakdown?.[key])))
    .map((key) => {
      const estimated = round(Number(params.estimatedBreakdown[key] || 0));
      const actual = round(Number(params.actualBreakdown?.[key] || 0));
      const amount = round(actual - estimated);
      return {
        key,
        label: AUDIT_COMPONENT_LABELS[key],
        estimated,
        actual,
        deviationAmount: amount,
        deviationPercent: estimated > 0 ? round(amount / estimated * 100) : 0,
      };
    })
    .sort((a, b) => Math.abs(b.deviationAmount) - Math.abs(a.deviationAmount));
  return { deviationAmount, deviationPercent, analysis };
}
