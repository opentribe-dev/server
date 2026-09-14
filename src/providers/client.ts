import type { ChatRequest, ChatResponse, ModelInfo, ProviderKind } from '@opencrew/protocol';

export interface ProviderClient {
  readonly kind: ProviderKind;
  chat(request: ChatRequest): Promise<ChatResponse>;
  listModels(): Promise<ModelInfo[]>;
}
