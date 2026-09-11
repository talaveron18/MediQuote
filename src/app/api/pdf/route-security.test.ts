import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findBudget: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    budget: { findUnique: mocks.findBudget },
  },
}));

import { GET } from './route';

describe('GET /api/pdf security boundary', () => {
  beforeEach(() => {
    mocks.requireAuth.mockReset();
    mocks.findBudget.mockReset();
    mocks.requireAuth.mockResolvedValue({ id: 'user-e2e', role: 'maestro' });
  });

  it('no expone mensajes internos cuando la generación falla', async () => {
    const secret = 'postgres://internal-user:super-secret@db.internal/mediquote';
    mocks.findBudget.mockRejectedValue(new Error(secret));

    const response = await GET(new NextRequest('https://mediquote.example/api/pdf?id=budget-1&mode=client'));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Error al generar el documento' });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
