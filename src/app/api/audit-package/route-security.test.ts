import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireRole: mocks.requireRole,
  logAudit: mocks.logAudit,
}));

vi.mock('@/lib/data-paths', () => ({
  dataRoot: () => '/tmp/mediquote-audit-package-test',
}));

vi.mock('@/lib/sqlite-backup', () => ({
  resolveSqlitePath: () => '/tmp/mediquote-audit-package-test/database.sqlite',
}));

vi.mock('@/lib/db', () => ({
  db: { auditLog: { findMany: vi.fn() } },
}));

import { POST } from './route';

describe('POST /api/audit-package security boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no expone el mensaje interno si falla la autorización o infraestructura', async () => {
    const secret = '/srv/mediquote/private/export-secret';
    mocks.requireRole.mockRejectedValue(new Error(secret));

    const response = await POST(new NextRequest('https://mediquote.example/api/audit-package?type=generate', {
      method: 'POST',
    }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Error al generar el paquete de auditoría' });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('el modo inválido devuelve error privado sin crear paquete', async () => {
    mocks.requireRole.mockResolvedValue({ id: 'admin-e2e', name: 'Admin QA', role: 'admin' });

    const response = await POST(new NextRequest('https://mediquote.example/api/audit-package?type=invalid', {
      method: 'POST',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Tipo no válido. Use type=generate' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
