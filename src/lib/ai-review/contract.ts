import type { BudgetSnapshot, ConsistencyCheck, ConsistencyIssue, ContractDraft, OperationalAnnex } from './types';

export function buildContractDraft(snapshot: BudgetSnapshot, intentionalDemoMismatch = false): ContractDraft {
  const price = intentionalDemoMismatch ? Math.max(0, snapshot.priceExVat - 360) : snapshot.priceExVat;
  return {
    title: 'Borrador de contrato de prestación de servicios sanitarios',
    reference: snapshot.reference,
    commercialPriceExVat: price,
    generatedAt: new Date().toISOString(),
    demo: intentionalDemoMismatch,
    pendingFields: ['Identidad y poder de representación del firmante', 'Forma y plazo de pago', 'Causa concreta de resolución anticipada'],
    clauses: [
      { heading: 'Objeto', text: `Prestación de ${snapshot.professionalCategory} en ${snapshot.municipality}, ${snapshot.province}.` },
      { heading: 'Duración y horario', text: `Del ${snapshot.startDate} al ${snapshot.endDate}; ${snapshot.schedule}.` },
      { heading: 'Equipo', text: `${snapshot.professionals} profesional(es), sujeto a validación de cobertura y descansos.` },
      { heading: 'Precio', text: `${price.toFixed(2)} € antes de IVA. La fiscalidad se aplicará por partida según el presupuesto aceptado.` },
      { heading: 'Protección de datos', text: 'Las partes limitarán el tratamiento a los datos imprescindibles y formalizarán, si procede, el encargo de tratamiento.' },
      { heading: 'Condición de validez', text: 'Borrador no vinculante hasta revisión humana, aprobación interna y firma de ambas partes.' },
    ],
  };
}

export function checkContractConsistency(snapshot: BudgetSnapshot, contract: ContractDraft): ConsistencyCheck {
  const issues: ConsistencyIssue[] = [];
  if (Math.abs(snapshot.priceExVat - contract.commercialPriceExVat) > 0.01) {
    issues.push({
      field: 'precio_sin_iva', budgetValue: snapshot.priceExVat.toFixed(2), contractValue: contract.commercialPriceExVat.toFixed(2),
      severity: 'critical' as const, message: 'El precio del contrato no coincide con el presupuesto.',
    });
  }
  if (contract.pendingFields.length > 0) {
    issues.push({
      field: 'campos_pendientes', budgetValue: 'No aplica', contractValue: contract.pendingFields.join('; '),
      severity: 'warning' as const, message: 'El contrato conserva campos que requieren confirmación humana.',
    });
  }
  return { consistent: issues.every((issue) => issue.severity !== 'critical'), issues, checkedAt: new Date().toISOString() };
}

export function checkArtifactConsistency(snapshot: BudgetSnapshot, contract: ContractDraft, annex: OperationalAnnex): ConsistencyCheck {
  const contractCheck = checkContractConsistency(snapshot, contract);
  const issues = [...contractCheck.issues];
  const annexText = annex.sections.map((section) => section.text).join(' ');
  if (!annexText.includes(snapshot.municipality) || !annexText.includes(String(snapshot.professionals))) {
    issues.push({ field: 'anexo_cobertura', budgetValue: `${snapshot.professionals} profesional(es) en ${snapshot.municipality}`, contractValue: annexText, severity: 'critical', message: 'El anexo operativo no conserva la ubicación o plantilla presupuestada.' });
  }
  if (annex.pendingFields.length > 0) issues.push({ field: 'anexo_pendiente', budgetValue: 'Expediente completo', contractValue: annex.pendingFields.join('; '), severity: 'warning', message: 'El anexo conserva datos operativos pendientes.' });
  return { consistent: !issues.some((issue) => issue.severity === 'critical'), issues, checkedAt: new Date().toISOString() };
}
