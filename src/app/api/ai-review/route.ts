import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { aiReviewRequestSchema } from '@/lib/ai-review/schemas';
import { getAiReviewProvider } from '@/lib/ai-review/provider';
import { buildContractDraft } from '@/lib/ai-review/contract';
import { containsPromptInjection, sanitizeText } from '@/lib/ai-review/sanitize';
import { consumeReviewQuota, getCachedReview, setCachedReview, snapshotCacheKey } from '@/lib/ai-review/guard';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!consumeReviewQuota(auth.id)) return NextResponse.json({ error: 'Demasiadas revisiones. Espera un minuto.' }, { status: 429 });
  try {
    const parsed = aiReviewRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Solicitud inválida', details: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.action === 'contract') return NextResponse.json({ contract: buildContractDraft(parsed.data.payload.snapshot, parsed.data.payload.intentionalDemoMismatch) });
    const provider = await getAiReviewProvider();
    if (parsed.data.action === 'intake') {
      const text = sanitizeText(parsed.data.payload.text);
      if (containsPromptInjection(text)) return NextResponse.json({ error: 'La entrada contiene instrucciones no fiables. Reformúlala como datos del servicio.' }, { status: 400 });
      return NextResponse.json({ mode: provider.mode, draft: await provider.parseIntake(text) });
    }
    const key = snapshotCacheKey(parsed.data.payload.snapshot, provider.mode);
    const cached = getCachedReview(key);
    if (cached) return NextResponse.json({ ...cached, cached: true });
    const review = await provider.review(parsed.data.payload.snapshot);
    setCachedReview(key, review);
    return NextResponse.json(review);
  } catch (error) {
    return NextResponse.json({ error: 'No se pudo completar la revisión', detail: error instanceof Error ? error.message : 'Error desconocido' }, { status: 500 });
  }
}
