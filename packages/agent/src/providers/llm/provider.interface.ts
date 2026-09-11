// LLM Provider Interface — abstraction over all AI model providers
// Implementations: AnthropicAdapter, OpenAIAdapter, GeminiAdapter, StubAdapter
// Reference: scriora-docs/architecture/SCRIORA_AGENT_FRAMEWORK.md
import { z } from 'zod';
export const LLMMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});
export type LLMMessage = z.infer<typeof LLMMessageSchema>;
export const LLMRequestSchema = z.object({
  model: z.string(),
  messages: z.array(LLMMessageSchema),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});
export type LLMRequest = z.infer<typeof LLMRequestSchema>;
export const LLMResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  finishReason: z.enum(['stop', 'max_tokens', 'content_filter', 'error']),
});
export type LLMResponse = z.infer<typeof LLMResponseSchema>;
export interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
  isAvailable(): Promise<boolean>;
}
