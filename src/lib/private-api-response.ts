import { NextResponse } from 'next/server';

export function privateNoStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  headers.set('X-Content-Type-Options', 'nosniff');
  return NextResponse.json(body, { ...init, headers });
}

export function genericInternalErrorResponse(publicMessage: string) {
  return privateNoStoreJson({ error: publicMessage }, { status: 500 });
}
