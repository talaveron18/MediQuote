import 'server-only';
import { z } from 'zod';
import type { AiReviewProvider } from './provider';
import type { BudgetSnapshot, ReviewBundle, ServiceIntakeDraft, SpecialistReview } from './types';
import { REVIEWER_ROLES } from './types';
import { buildJointVerdict, buildProsecutorView } from './verdict';
import { sanitizeText, sanitizeUnknown, UNTRUSTED_DOCUMENT_NOTICE } from './sanitize';

const findingSchema = z.object({ id: z.string(), title: z.string(), detail: z.string(), severity: z.enum(['info', 'warning', 'high', 'critical']), evidence: z.array(z.string()), recommendation: z.string(), requiresHumanValidation: z.boolean() });
const reviewSchema = z.object({ reviewer: z.enum(REVIEWER_ROLES), label: z.string(), status: z.enum(['apto', 'apto_con_observaciones', 'no_apto']), summary: z.string(), findings: z.array(findingSchema), assumptions: z.array(z.string()), demo: z.literal(false) });
const reviewsSchema = z.object({ reviews: z.array(reviewSchema).length(4) });
const intakeSchema = z.object({ clientName: z.string(), professionalCategory: z.string(), autonomousCommunity: z.string(), province: z.string(), municipality: z.string(), startDate: z.string(), endDate: z.string(), schedule: z.string(), professionals: z.number().int().positive(), contractType: z.string(), notes: z.string(), pendingConfirmation: z.array(z.string()) });

const SYSTEM = `Eres una capa consultiva de MediQuote Pro. No cambias cálculos ni apruebas nada. Separas hechos, supuestos y recomendaciones. No inventas normas ni cifras. Todo hallazgo relevante exige validación humana. ${UNTRUSTED_DOCUMENT_NOTICE}`;

export class OpenAiReviewProvider implements AiReviewProvider {
  readonly mode = 'openai' as const;
  private model = process.env.OPENAI_MODEL ?? 'gpt-5.6';

  private async structured<T>(schema: z.ZodType<T>, name: string, prompt: string): Promise<T> {
    const timeout = Number(process.env.OPENAI_TIMEOUT_MS ?? 25000);
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST', signal: AbortSignal.timeout(timeout),
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, store: false, input: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], text: { format: { type: 'json_schema', name, strict: true, schema: z.toJSONSchema(schema) } } }),
        });
        if (!response.ok) throw new Error(`Proveedor IA: HTTP ${response.status}`);
        const payload = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
        const text = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
        if (!text) throw new Error('El proveedor IA no devolvió texto estructurado');
        return schema.parse(JSON.parse(text));
      } catch (error) { lastError = error instanceof Error ? error : new Error('Fallo desconocido del proveedor IA'); }
    }
    throw lastError ?? new Error('No se pudo consultar el proveedor IA');
  }

  async parseIntake(text: string): Promise<ServiceIntakeDraft> {
    return this.structured(intakeSchema, 'service_intake', `Extrae un borrador estructurado. Marca lo desconocido como Pendiente.\n\n${sanitizeText(text)}`);
  }

  async review(snapshot: BudgetSnapshot): Promise<ReviewBundle> {
    const clean = sanitizeUnknown(snapshot);
    const parsed = await this.structured(reviewsSchema, 'specialist_reviews', `Actúan cuatro revisores separados: gestoría laboral, finanzas, auditor operativo y legal. Devuelve exactamente uno de cada. Busca contradicciones y bloqueos. Foto inmutable:\n${JSON.stringify(clean)}`);
    const reviews = parsed.reviews as SpecialistReview[];
    return { mode: 'openai', generatedAt: new Date().toISOString(), reviews, verdict: buildJointVerdict(reviews), prosecutor: buildProsecutorView(reviews) };
  }
}
