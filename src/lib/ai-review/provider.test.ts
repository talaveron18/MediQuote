import { afterEach, describe, expect, it } from 'vitest';
import { getAiReviewProvider } from './provider';

const originalDemo = process.env.OPENAI_DEMO_MODE;
const originalKey = process.env.OPENAI_API_KEY;

describe.sequential('selección explícita de proveedor', () => {
  afterEach(() => {
    if (originalDemo === undefined) delete process.env.OPENAI_DEMO_MODE; else process.env.OPENAI_DEMO_MODE = originalDemo;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  });

  it('permite demo sin clave cuando se solicita', async () => {
    process.env.OPENAI_DEMO_MODE = 'true'; delete process.env.OPENAI_API_KEY;
    expect((await getAiReviewProvider()).mode).toBe('demo');
  });

  it('no suplanta silenciosamente el proveedor real', async () => {
    process.env.OPENAI_DEMO_MODE = 'false'; delete process.env.OPENAI_API_KEY;
    await expect(getAiReviewProvider()).rejects.toThrow(/no configurado/i);
  });
});
