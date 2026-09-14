import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { createUser } from '../users/repository.js';
import { createAgent } from '../agents/repository.js';
import { createConversation } from '../conversations/repository.js';
import { createAgentRun } from '../runtime/runs.js';
import { createApproval } from './repository.js';

describe('approval routes', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  async function setupPendingApproval() {
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
    const runId = randomUUID();
    const run = createAgentRun(db, {
      runId,
      rootRunId: runId,
      causationId: null,
      hopCount: 0,
      agentId: agent.id,
      conversationId: conversation.id,
    });
    const approval = createApproval(db, { runId: run.runId, agentId: agent.id, action: 'send_email', details: {} });
    return { owner, approval };
  }

  it('lists pending approvals and resolves one', async () => {
    const app = await buildApp({ db });
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'admin@example.com', displayName: 'Admin', password: 'super-secret-1' },
    });
    const token = setup.json().token as string;
    const { approval } = await setupPendingApproval();

    const list = await app.inject({
      method: 'GET',
      url: '/api/approvals',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.json()).toHaveLength(1);

    const respond = await app.inject({
      method: 'POST',
      url: `/api/approvals/${approval.id}/respond`,
      headers: { authorization: `Bearer ${token}` },
      payload: { decision: 'approve' },
    });
    expect(respond.statusCode).toBe(200);
    expect(respond.json().status).toBe('approved');

    await app.close();
  });

  it('rejects responding to an already-resolved approval with 409', async () => {
    const app = await buildApp({ db });
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'admin@example.com', displayName: 'Admin', password: 'super-secret-1' },
    });
    const token = setup.json().token as string;
    const { approval } = await setupPendingApproval();

    await app.inject({
      method: 'POST',
      url: `/api/approvals/${approval.id}/respond`,
      headers: { authorization: `Bearer ${token}` },
      payload: { decision: 'approve' },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/approvals/${approval.id}/respond`,
      headers: { authorization: `Bearer ${token}` },
      payload: { decision: 'deny' },
    });
    expect(second.statusCode).toBe(409);

    await app.close();
  });
});
