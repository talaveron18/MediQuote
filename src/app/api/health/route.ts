import { db } from '@/lib/db';
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response';

export async function GET() {
  const timestamp = new Date().toISOString();

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
