import { describe, expect, it } from 'vitest';
import {
  genericInternalErrorResponse,
  privateNoStoreHeaders,
  privateNoStoreJson,
  privateNoStoreResponse,
} from './private-api-response';

describe('private API responses', () => {
  it('marca respuestas privadas JSON como no almacenables y no sniffables', async () => {
    const response = privateNoStoreJson({ ok: true }, { status: 200 });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('aplica la misma frontera a respuestas binarias privadas sin perder cabeceras explícitas', async () => {
    const response = privateNoStoreResponse(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="x.bin"' },
    });
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="x.bin"');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sobrescribe intentos de relajar la política privada', () => {
    const headers = privateNoStoreHeaders({ 'Cache-Control': 'public, max-age=3600' });
    expect(headers.get('cache-control')).toBe('private, no-store');
  });

  it('el error interno público solo contiene el mensaje genérico aprobado', async () => {
    const response = genericInternalErrorResponse('Error al generar el documento');
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Error al generar el documento' });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
