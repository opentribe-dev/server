import type { ChatMessage, Message } from '@opencrew/protocol';
import type Database from 'better-sqlite3';
import { getAgent } from '../agents/repository.js';
import { listMemoryFactsForAgent } from '../memory/repository.js';
import { getConversationSummary } from '../memory/summary-repository.js';
import type { RespondFn } from '../runtime/engine.js';
import { ProviderError } from './errors.js';
import { getProviderConfig } from './repository.js';
import { resolveProviderClient } from './registry.js';

function toChatMessages(agentId: string, recentMessages: Message[]): ChatMessage[] {
  return recentMessages.map((m) => ({
    role: m.authorType === 'agent' && m.authorId === agentId ? 'assistant' : 'user',
    content: m.body,
  }));
}

async function chatViaProvider(
  db: Database.Database,
  providerId: string,
  model: string,
  messages: ChatMessage[],
  fetchImpl: typeof fetch
) {
  const config = getProviderConfig(db, providerId);
  if (!config) {
    throw new ProviderError(`no provider configured with id "${providerId}"`);
  }
  const client = resolveProviderClient(config, fetchImpl);
  return client.chat({ providerId, model, messages });
}

export function createProviderRespond(db: Database.Database, fetchImpl: typeof fetch = fetch): RespondFn {
  return async ({ agentId, conversationId, recentMessages }) => {
    const agent = getAgent(db, agentId);
    if (!agent) {
      return { body: `[error] agent ${agentId} not found` };
    }

    const facts = listMemoryFactsForAgent(db, agentId).slice(-20);
    const summary = getConversationSummary(db, conversationId);
    const context = [agent.personality && `Agent instructions: ${agent.personality}`,
      facts.length && `Memory facts:\n${facts.map((f) => `- ${f.content}`).join('\n')}`,
      summary && `Conversation summary: ${summary.summary}`].filter(Boolean).join('\n\n');
    const chatMessages: ChatMessage[] = context
      ? [{ role: 'system', content: context }, ...toChatMessages(agentId, recentMessages)]
      : toChatMessages(agentId, recentMessages);

    try {
      const response = await chatViaProvider(
        db,
        agent.modelPolicy.defaultProviderId,
        agent.modelPolicy.defaultModel,
        chatMessages,
        fetchImpl
      );
      return { body: response.content };
    } catch (primaryError) {
      if (!(primaryError instanceof ProviderError)) throw primaryError;

      if (agent.modelPolicy.fallbackProviderId && agent.modelPolicy.fallbackModel) {
        try {
          const fallbackResponse = await chatViaProvider(
            db,
            agent.modelPolicy.fallbackProviderId,
            agent.modelPolicy.fallbackModel,
            chatMessages,
            fetchImpl
          );
          return { body: fallbackResponse.content };
        } catch (fallbackError) {
          if (!(fallbackError instanceof ProviderError)) throw fallbackError;
        }
      }

      return { body: `[error] agent ${agentId} could not respond right now: ${primaryError.message}` };
    }
  };
}
