import 'server-only';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
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
  private client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? 25000), maxRetries: 1 });
  private model = process.env.OPENAI_MODEL ?? 'gpt-5.6';

  async parseIntake(text: string): Promise<ServiceIntakeDraft> {
    const response = await this.client.responses.parse({ model: this.model, store: false, input: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Extrae un borrador estructurado. Marca lo desconocido como Pendiente.\n\n${sanitizeText(text)}` }], text: { format: zodTextFormat(intakeSchema, 'service_intake') } });
    if (!response.output_parsed) throw new Error('La IA no devolvió una entrada estructurada válida');
    return response.output_parsed;
  }

  async review(snapshot: BudgetSnapshot): Promise<ReviewBundle> {
    const clean = sanitizeUnknown(snapshot);
    const response = await this.client.responses.parse({ model: this.model, store: false, input: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Actúan cuatro revisores separados: gestoría laboral, finanzas, auditor operativo y legal. Devuelve exactamente uno de cada. Busca contradicciones y bloqueos. Foto inmutable:\n${JSON.stringify(clean)}` }], text: { format: zodTextFormat(reviewsSchema, 'specialist_reviews') } });
    if (!response.output_parsed) throw new Error('La IA no devolvió revisiones estructuradas válidas');
    const reviews = response.output_parsed.reviews as SpecialistReview[];
    return { mode: 'openai', generatedAt: new Date().toISOString(), reviews, verdict: buildJointVerdict(reviews), prosecutor: buildProsecutorView(reviews) };
  }
}
