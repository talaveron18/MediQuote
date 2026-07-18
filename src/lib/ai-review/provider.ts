import type { BudgetSnapshot, ReviewBundle, ServiceIntakeDraft } from './types';
import { buildDemoBundle, demoIntake } from './demo-provider';

export interface AiReviewProvider {
  readonly mode: 'demo' | 'openai';
  parseIntake(text: string): Promise<ServiceIntakeDraft>;
  review(snapshot: BudgetSnapshot): Promise<ReviewBundle>;
}

class DemoProvider implements AiReviewProvider {
  readonly mode = 'demo' as const;
  async parseIntake(text: string) { return demoIntake(text); }
  async review(snapshot: BudgetSnapshot) { return buildDemoBundle(snapshot); }
}

export async function getAiReviewProvider(): Promise<AiReviewProvider> {
  const demoRequested = process.env.OPENAI_DEMO_MODE !== 'false';
  if (demoRequested) return new DemoProvider();
  if (!process.env.OPENAI_API_KEY) throw new Error('Proveedor real no configurado. Active explícitamente OPENAI_DEMO_MODE=true para usar la demostración.');
  const { OpenAiReviewProvider } = await import('./openai-provider');
  return new OpenAiReviewProvider();
}
