import { describe, expect, it } from 'vitest';
import { genericInternalErrorResponse, privateNoStoreJson } from './private-api-response';

describe('private API responses', () => {
  it('marca respuestas privadas como no almacenables y no sniffables', async () => {
    const response = privateNoStoreJson({ ok: true }, { status: 200 });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('el error interno público solo contiene el mensaje genérico aprobado', async () => {
    const response = genericInternalErrorResponse('Error al generar el documento');
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Error al generar el documento' });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
