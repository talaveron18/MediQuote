import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  findBudget: vi.fn(),
  findQuote: vi.fn(),
  logAudit: vi.fn(),
  calculateCosting: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireRole: mocks.requireRole,
  logAudit: mocks.logAudit,
}));

vi.mock('@/lib/db', () => ({
  db: {
    budget: { findUnique: mocks.findBudget },
    costingQuote: { findFirst: mocks.findQuote },
  },
}));

vi.mock('@/lib/costing/cost-engine', () => ({ calculateCosting: mocks.calculateCosting }));

import { GET, POST } from './route';

const validInput = {
  serviceId: 'svc-qa',
  professionalProfile: 'enfermeria',
  province: 'Madrid',
  municipality: 'Madrid',
  hours: {
    coverageHours: 8,
    workingDays: 1,
    shifts: 1,
    breakdown: {
      total: 8, regular: 8, night: 0, sunday: 0, holiday: 0,
      holidayNational: 0, holidayAutonomico: 0, holidayProvincial: 0,
      holidayMunicipal: 0, weekend: 0,
    },
  },
  salary: {
    annualOrdinaryBaseSalary: 1,
    extraPay: { paymentsPerYear: 0, amountPerPayment: 0, paymentMode: 'prorated' },
    annualFixedSupplements: 0,
    annualOtherSalaryItems: 0,
    annualConventionHours: 1,
    annualProductiveHours: 1,
    smiAnnual: 1,
    source: { id: 'salary-source', label: 'QA', status: 'verified' },
  },
  plusRules: [],
  employerContributions: {
    commonContingenciesPercent: 0,
    unemploymentPercent: 0,
    fogasaPercent: 0,
    vocationalTrainingPercent: 0,
    meiPercent: 0,
    otherPercent: 0,
    source: { id: 'ss-source', label: 'QA', status: 'verified' },
  },
  occupationalRisk: {
    temporaryDisabilityPercent: 0,
    disabilityDeathSurvivorPercent: 0,
    source: { id: 'risk-source', label: 'QA', status: 'verified' },
  },
  contract: {
    contractType: 'indefinido',
    laborContracts: 1,
    managementFeePerLaborContract: 0,
    terminationProvisionPercent: 0,
    otherFixedContractCosts: 0,
  },
  overhead: { percentageOnExpandedLabor: 0, fixedAmount: 0 },
  directCosts: [],
  commercialPolicy: {
    gasiMarkupOnCostPercent: 0,
    commercialFloorOnCostPercent: 0,
    commercialBufferOnCostPercent: 0,
    commissionAtFloorPercent: 0,
    commissionIntermediatePercent: 0,
    commissionAtListPercent: 0,
    semaphoreTargetReturnOnCostPercent: 0,
    semaphoreReviewReturnOnCostPercent: 0,
  },
};

function costingRequest(body: unknown) {
  return new NextRequest('https://mediquote.example/api/costing', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/costing security boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: 'admin-e2e', name: 'Admin QA', role: 'admin' });
  });

  it('no expone detalles internos de infraestructura en un fallo del repositorio', async () => {
    const secret = 'postgres://cost-user:cost-secret@internal-db/mediquote';
    mocks.findBudget.mockRejectedValue(new Error(secret));

    const response = await GET(new NextRequest('https://mediquote.example/api/costing?budgetId=budget-1'));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Error al consultar la cotización económica' });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('mantiene privados también los errores de validación previos a consulta', async () => {
    const response = await GET(new NextRequest('https://mediquote.example/api/costing'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Falta budgetId' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('POST /api/costing strict request boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: 'admin-e2e', name: 'Admin QA', role: 'admin' });
    mocks.calculateCosting.mockReturnValue({ status: 'pending_configuration', issues: [], action: 'complete_in_administration' });
  });

  it('rechaza campos desconocidos de primer nivel antes del motor y la auditoría', async () => {
    const response = await POST(costingRequest({ input: validInput, injected: true }));
    expect(response.status).toBe(400);
    expect(mocks.calculateCosting).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rechaza campos desconocidos anidados antes del motor y la auditoría', async () => {
    const response = await POST(costingRequest({ input: { ...validInput, overhead: { ...validInput.overhead, adminOverride: 999 } } }));
    expect(response.status).toBe(400);
    expect(mocks.calculateCosting).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('no convierte cadenas numéricas en importes económicos', async () => {
    const response = await POST(costingRequest({ input: { ...validInput, commercialPolicy: { ...validInput.commercialPolicy, commissionAtListPercent: '10' } } }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.issues[0].field).toBe('input.commercialPolicy.commissionAtListPercent');
    expect(mocks.calculateCosting).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('rechaza enumeraciones económicas/contractuales fuera del contrato', async () => {
    const response = await POST(costingRequest({ input: { ...validInput, contract: { ...validInput.contract, contractType: 'inventado' } } }));
    expect(response.status).toBe(400);
    expect(mocks.calculateCosting).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('mantiene el flujo válido y audita solo después de validar', async () => {
    const response = await POST(costingRequest({ input: validInput }));
    expect(response.status).toBe(200);
    expect(mocks.calculateCosting).toHaveBeenCalledTimes(1);
    expect(mocks.calculateCosting).toHaveBeenCalledWith(validInput);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });
});
