import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  findBudget: vi.fn(),
  findQuote: vi.fn(),
  logAudit: vi.fn(),
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

import { GET } from './route';

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
