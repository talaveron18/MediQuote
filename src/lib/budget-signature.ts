import { createHash } from 'node:crypto';

export const SIGNATURE_CONSENT = 'Declaro haber revisado el presupuesto, aceptar su contenido y firmarlo electrónicamente en representación del cliente indicado.';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

export function canonicalBudgetForSignature(budget: any) {
  return stable({
    id: budget.id, code: budget.code, clientId: budget.clientId,
    statusAtIssue: budget.status, validUntil: budget.validUntil, description: budget.description,
    subtotal: budget.subtotal, discountPercent: budget.discountPercent, discountAmount: budget.discountAmount,
    ivaAmount: budget.ivaAmount, totalFinal: budget.totalFinal,
    serviceLocationId: budget.serviceLocationId,
    serviceAutonomousCommunity: budget.serviceAutonomousCommunity,
    serviceProvince: budget.serviceProvince, serviceMunicipality: budget.serviceMunicipality,
    client: budget.client ? {
      businessName: budget.client.businessName, cif: budget.client.cif,
      fiscalAddress: budget.client.fiscalAddress, email: budget.client.email,
    } : undefined,
    serviceBlocks: (budget.serviceBlocks ?? []).map((block: any) => ({
      serviceName: block.serviceName, professionalCategory: block.professionalCategory,
      specificDates: block.specificDates, dateRangeStart: block.dateRangeStart, dateRangeEnd: block.dateRangeEnd,
      shiftType: block.shiftType, shiftStartTime: block.shiftStartTime, shiftEndTime: block.shiftEndTime,
      totalWorkingDays: block.totalWorkingDays, totalHours: block.totalHours,
      blockClosingPrice: block.blockClosingPrice, ivaPercent: block.ivaPercent,
      ivaAmount: block.ivaAmount, blockTotalFinal: block.blockTotalFinal,
    })),
  });
}

export function hashBudgetForSignature(budget: any): string {
  return createHash('sha256').update(JSON.stringify(canonicalBudgetForSignature(budget))).digest('hex');
}

export function hashSignatureToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
