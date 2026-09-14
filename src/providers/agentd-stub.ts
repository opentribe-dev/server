import type { ChatRequest, ChatResponse, ModelInfo, ProviderKind } from '@opencrew/protocol';
import type { ProviderClient } from './client.js';
import { ProviderUnavailableError } from './errors.js';

export class AgentdBackedProviderClient implements ProviderClient {
  constructor(public readonly kind: ProviderKind) {}

  async chat(_request: ChatRequest): Promise<ChatResponse> {
    throw new ProviderUnavailableError(
      `${this.kind} is agentd-backed and agentd is not yet available in this workspace`
    );
  }

  async listModels(): Promise<ModelInfo[]> {
    throw new ProviderUnavailableError(
      `${this.kind} is agentd-backed and agentd is not yet available in this workspace`
    );
  }
}
