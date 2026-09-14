import { describe, expect, it } from 'vitest';
import { AgentdBackedProviderClient } from './agentd-stub.js';
import { ProviderUnavailableError } from './errors.js';

describe('AgentdBackedProviderClient', () => {
  it('rejects chat with ProviderUnavailableError, never a faked success', async () => {
    const client = new AgentdBackedProviderClient('claude-subscription');
    await expect(
      client.chat({ providerId: 'my-claude-subscription', model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('rejects listModels with ProviderUnavailableError', async () => {
    const client = new AgentdBackedProviderClient('ollama');
    await expect(client.listModels()).rejects.toThrow(ProviderUnavailableError);
  });
});
