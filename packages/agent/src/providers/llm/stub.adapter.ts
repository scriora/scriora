// Stub LLM Provider — deterministic responses for CI/CD and testing
// DEFAULT provider until production AI is explicitly enabled
// Reference: scriora-docs/architecture/SCRIORA_AGENT_FRAMEWORK.md
// RULE: All agent evaluation tests must pass with this stub — no live LLM calls in CI
import type { LLMProvider, LLMRequest, LLMResponse } from './provider.interface.js';
export class StubLLMAdapter implements LLMProvider {
  readonly name = 'stub';
  readonly defaultModel = 'stub-deterministic-v1';
  // Override responses per test scenario
  private responses: Map<string, string> = new Map();
  setResponse(trigger: string, response: string): void {
    this.responses.set(trigger, response);
  }
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const lastMessage = request.messages.at(-1)?.content ?? '';
    const matched = [...this.responses.entries()].find(([trigger]) =>
      lastMessage.includes(trigger)
    );
    const content = matched
      ? matched[1]
      : `[STUB] Deterministic response for: ${lastMessage.slice(0, 50)}`;
    return {
      content,
      model: this.defaultModel,
      inputTokens: Math.ceil(lastMessage.length / 4),
      outputTokens: Math.ceil(content.length / 4),
      finishReason: 'stop',
    };
  }
  async isAvailable(): Promise<boolean> {
    return true; // Stub is always available
  }
}
