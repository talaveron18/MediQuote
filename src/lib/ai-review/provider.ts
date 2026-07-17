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
  if (demoRequested || !process.env.OPENAI_API_KEY) return new DemoProvider();
  const { OpenAiReviewProvider } = await import('./openai-provider');
  return new OpenAiReviewProvider();
}
