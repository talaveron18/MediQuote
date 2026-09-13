import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ userCount: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: { user: { count: mocks.userCount } },
}));

import { GET } from './route';

describe('GET /api/health disclosure boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('solo expone salud mínima y nunca cardinalidades internas', async () => {
    mocks.userCount.mockResolvedValue(37);
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.db).toBe('ok');
    expect(body).not.toHaveProperty('userCount');
    expect(body).not.toHaveProperty('maestroExists');
    expect(body).not.toHaveProperty('legalRecordsCount');
    expect(body).not.toHaveProperty('legalParametersCount');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('no expone detalles internos cuando falla la base de datos', async () => {
    const secret = 'postgres://internal-host/private-db';
    mocks.userCount.mockRejectedValue(new Error(secret));
    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toContain('Base de datos no disponible');
    expect(text).not.toContain(secret);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
