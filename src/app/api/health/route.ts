import { db } from '@/lib/db';
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response';

export async function GET(request: Request) {
  const timestamp = new Date().toISOString();

  if (new URL(request.url).searchParams.size > 0) {
    return privateNoStoreJson({ error: 'Parámetros de consulta no admitidos' }, { status: 400 });
  }

  try {
    // The public health contract only proves database reachability. Internal
    // cardinalities, account state and legal-record counts are deliberately
    // not exposed because they are operational metadata, not health signals.
    await db.user.count();

    return privateNoStoreJson({
      ok: true,
      app: 'MediQuote Pro',
      db: 'ok',
      timestamp,
    });
  } catch {
    return genericInternalErrorResponse('Base de datos no disponible');
  }
}
