import { NextResponse, type NextRequest } from 'next/server';

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export const config = {
  matcher: [
    '/api/budgets/:path*',
    '/api/costing/:path*',
    '/api/cost-audits/:path*',
    '/api/audit-package/:path*',
    '/api/config/:path*',
  ],
};
