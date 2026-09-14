import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { createUser } from '../users/repository.js';
import { createAgent } from '../agents/repository.js';
import { createConversation } from '../conversations/repository.js';
import { createMessage } from '../messages/repository.js';
import { ConnectionHub } from '../ws/hub.js';
import { defaultRespond, runAgentTurn, type AgentTurnResult } from './engine.js';
import { getAgentRun } from './runs.js';

describe('runAgentTurn (single turn, no handoff)', () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function freshSetup() {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencrew-engine-'));
    const db = openDatabase(dataDir);
    runMigrations(db);
    const owner = createUser(db, { email: 'owner@example.com', displayName: 'Owner', passwordHash: 'x', role: 'owner' });
    const agent = createAgent(db, {
      ownerUserId: owner.id,
      name: 'Assistant',
      personality: '',
      modelPolicy: { defaultProviderId: 'anthropic', defaultModel: 'claude-sonnet-5' },
      permissions: { tools: [], canMessageAgents: true, canApproveOwnActions: false },
    });
    const conversation = createConversation(db, {
      kind: 'dm',
      name: null,
      participants: [
        { participantId: owner.id, participantType: 'user' },
        { participantId: agent.id, participantType: 'agent' },
      ],
    });
    createMessage(db, {
      conversationId: conversation.id,
      authorId: owner.id,
      authorType: 'user',
      body: 'hello agent',
      mentions: [],
      replyToMessageId: null,
    });
    const hub = new ConnectionHub(db);
    return { db, agent, conversation, hub };
  }

  it('persists a run, calls respond with recent conversation context, and persists+publishes the response as an agent message', async () => {
    const { db, agent, conversation, hub } = freshSetup();
    const respond = vi.fn(async (): Promise<AgentTurnResult> => ({ body: 'hello human' }));

    const outcome = await runAgentTurn(
      { db, hub, respond },
      { agentId: agent.id, conversationId: conversation.id }
    );

    expect(respond).toHaveBeenCalledOnce();
    const call = respond.mock.calls[0][0];
    expect(call.agentId).toBe(agent.id);
    expect(call.recentMessages).toHaveLength(1);
    expect(call.recentMessages[0].body).toBe('hello agent');

    expect(outcome.message.authorType).toBe('agent');
    expect(outcome.message.authorId).toBe(agent.id);
    expect(outcome.message.body).toBe('hello human');
    expect(outcome.run.hopCount).toBe(0);
    expect(outcome.handoff).toEqual({ attempted: false, dispatched: false });

    expect(getAgentRun(db, outcome.run.runId)?.runId).toBe(outcome.run.runId);
    db.close();
  });

  it('defaultRespond returns a deterministic stub response mentioning the agent', async () => {
    const result = await defaultRespond({ agentId: 'agent_1', conversationId: 'conversation_1', recentMessages: [] });
    expect(result.body).toContain('agent_1');
    expect(result.handoffToAgentId).toBeUndefined();
  });
});
