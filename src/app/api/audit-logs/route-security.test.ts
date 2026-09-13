import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  auditFindMany: vi.fn(),
  configAuditFindMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/db', () => ({
  db: {
    auditLog: { findMany: mocks.auditFindMany },
    configAuditLog: { findMany: mocks.configAuditFindMany },
  },
}));

import { GET } from './route';

describe('GET /api/audit-logs reliability boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: 'admin-e2e', role: 'admin' });
  });

  it('usa el almacén compatible cuando falla AuditLog', async () => {
    mocks.auditFindMany.mockRejectedValue(new Error('tabla nueva no disponible'));
    mocks.configAuditFindMany.mockResolvedValue([{ id: 'legacy-audit-1' }]);

    const response = await GET(new Request('https://mediquote.example/api/audit-logs'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 'legacy-audit-1' }]);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('falla cerrado si ningún almacén de auditoría es legible', async () => {
    const secret = 'postgres://audit-private/internal';
    mocks.auditFindMany.mockRejectedValue(new Error(secret));
    mocks.configAuditFindMany.mockRejectedValue(new Error(secret));

    const response = await GET(new Request('https://mediquote.example/api/audit-logs'));
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).toContain('Error al obtener el registro de auditoría');
    expect(text).not.toContain(secret);
    expect(text).not.toBe('[]');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
