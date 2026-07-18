import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  EXTERNAL_SOURCE_DISCLAIMER,
  extractBudgetPatch,
  LEGAL_DISCLAIMER,
  looksNormative,
  type AiBudgetReply,
  type NormativeSource,
} from '@/lib/ai-budget';

const OFFICIAL_HOSTS = [
  'boe.es', 'aeat.es', 'agenciatributaria.es', 'seg-social.es', 'mites.gob.es',
  'sepe.es', 'itss.gob.es', 'eur-lex.europa.eu', 'jccm.es', 'jcyl.es', 'comunidad.madrid',
  'diputacion', 'bop', 'boletinoficial',
];

function officialUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OFFICIAL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`) || host.includes(allowed));
  } catch { return false; }
}

function parseJsonText(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')); } catch { return null; }
}

async function normativeLookup(question: string): Promise<AiBudgetReply> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      kind: 'normative',
      text: `No puedo consultar fuentes externas porque el servidor no tiene configurada la búsqueda normativa. No voy a inventar una respuesta.\n\n${LEGAL_DISCLAIMER}`,
      sources: [],
      uncertainty: 'Configura OPENAI_API_KEY para habilitar la consulta en fuentes oficiales.',
    };
  }
  const consultedAt = new Date().toISOString().slice(0, 10);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_NORMATIVE_MODEL || 'gpt-5-mini',
      tools: [{ type: 'web_search' }],
      input: [
        { role: 'system', content: `Eres un asistente interno de GASI. Busca únicamente fuentes oficiales y primarias españolas o EUR-Lex. No inventes normas, artículos, porcentajes ni plazos. Distingue hechos localizados, interpretación orientativa, aspectos que requieren profesional e insuficiencia de evidencia. No modifiques reglas ni cálculos. Responde SOLO JSON válido con: answer (string), uncertainty (string opcional), sources (array con title, organization, publishedAt opcional, relevantSection, url). Fecha de consulta: ${consultedAt}.` },
        { role: 'user', content: question },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Consulta externa no disponible (${response.status})`);
  const body = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const raw = body.output_text || body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text || '';
  const parsed = parseJsonText(raw);
  if (!parsed || typeof parsed.answer !== 'string') throw new Error('La fuente externa devolvió una respuesta no verificable');
  const sources = (Array.isArray(parsed.sources) ? parsed.sources : [])
    .filter((source): source is Record<string, unknown> => !!source && typeof source === 'object' && typeof source.url === 'string' && officialUrl(source.url))
    .map((source): NormativeSource => ({
      title: String(source.title || 'Fuente oficial'),
      organization: String(source.organization || 'Organismo público'),
      publishedAt: source.publishedAt ? String(source.publishedAt) : undefined,
      consultedAt,
      relevantSection: source.relevantSection ? String(source.relevantSection) : undefined,
      url: String(source.url),
    }));
  if (!sources.length) {
    return {
      kind: 'normative',
      text: `No he podido respaldar la respuesta con una fuente oficial específica, por lo que no la presento como conclusión.\n\n${LEGAL_DISCLAIMER}`,
      sources: [],
      uncertainty: 'Evidencia oficial insuficiente o enlace no verificable.',
    };
  }
  return {
    kind: 'normative',
    text: `${parsed.answer}\n\n${LEGAL_DISCLAIMER}\n\n${EXTERNAL_SOURCE_DISCLAIMER}`,
    sources,
    uncertainty: parsed.uncertainty ? String(parsed.uncertainty) : undefined,
  };
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json() as { message?: string; mode?: 'budget' | 'normative' | 'auto' };
    const message = String(body.message || '').trim();
    if (!message || message.length > 4_000) return NextResponse.json({ error: 'Consulta vacía o demasiado larga' }, { status: 400 });
    const normative = body.mode === 'normative' || (body.mode !== 'budget' && looksNormative(message));
    if (normative) return NextResponse.json(await normativeLookup(message));
    const patch = extractBudgetPatch(message);
    const reply: AiBudgetReply = {
      kind: 'budget',
      text: [patch.summary, ...patch.questions].join('\n'),
      patch,
    };
    return NextResponse.json(reply);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo procesar la consulta' }, { status: 502 });
  }
}
