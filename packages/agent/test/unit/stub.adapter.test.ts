import { describe, expect, it } from 'vitest';
import {
  LLMMessageSchema,
  LLMRequestSchema,
  LLMResponseSchema,
} from '../../src/providers/llm/provider.interface.js';
import { StubLLMAdapter } from '../../src/providers/llm/stub.adapter.js';

describe('StubLLMAdapter & Provider Interface Tests', () => {
  it('validates schemas correctly', () => {
    const validMsg = { role: 'user', content: 'hello' };
    expect(LLMMessageSchema.parse(validMsg)).toEqual(validMsg);

    const validReq = {
      model: 'test-model',
      messages: [validMsg],
      maxTokens: 100,
      temperature: 0.7,
    };
    expect(LLMRequestSchema.parse(validReq)).toEqual(validReq);

    const validRes = {
      content: 'response content',
      model: 'test-model',
      inputTokens: 10,
      outputTokens: 20,
      finishReason: 'stop',
    };
    expect(LLMResponseSchema.parse(validRes)).toEqual(validRes);
  });

  it('generates deterministic fallback responses', async () => {
    const adapter = new StubLLMAdapter();
    expect(adapter.name).toBe('stub');
    expect(adapter.defaultModel).toBe('stub-deterministic-v1');
    expect(await adapter.isAvailable()).toBe(true);

    const res = await adapter.complete({
      model: adapter.defaultModel,
      messages: [{ role: 'user', content: 'Generate a blog post title' }],
    });

    expect(res.finishReason).toBe('stop');
    expect(res.content).toContain('[STUB] Deterministic response for: Generate a blog post title');
    expect(res.inputTokens).toBeGreaterThan(0);
    expect(res.outputTokens).toBeGreaterThan(0);
  });

  it('returns custom responses when trigger matches', async () => {
    const adapter = new StubLLMAdapter();
    adapter.setResponse('SPECIAL_PROMPT', 'Custom mocked result');

    const res = await adapter.complete({
      model: adapter.defaultModel,
      messages: [{ role: 'user', content: 'Please run SPECIAL_PROMPT now' }],
    });

    expect(res.content).toBe('Custom mocked result');
  });

  it('handles empty messages gracefully', async () => {
    const adapter = new StubLLMAdapter();
    const res = await adapter.complete({
      model: adapter.defaultModel,
      messages: [],
    });
    expect(res.content).toBe('[STUB] Deterministic response for: ');
  });
});
