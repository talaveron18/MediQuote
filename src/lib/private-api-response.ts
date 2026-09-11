import { NextResponse } from 'next/server';

export function privateNoStoreHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

export function privateNoStoreResponse(body?: BodyInit | null, init: ResponseInit = {}) {
  return new NextResponse(body, { ...init, headers: privateNoStoreHeaders(init.headers) });
}

export function privateNoStoreJson(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, { ...init, headers: privateNoStoreHeaders(init.headers) });
}

export function genericInternalErrorResponse(publicMessage: string) {
  return privateNoStoreJson({ error: publicMessage }, { status: 500 });
}
