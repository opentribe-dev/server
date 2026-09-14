import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';

describe('runtime routes', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  async function setupOwnerAndAgent(app: Awaited<ReturnType<typeof buildApp>>) {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'owner@example.com', displayName: 'Owner', password: 'super-secret-1' },
    });
    const token = setup.json().token as string;
    const createAgent = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Assistant', modelPolicy: { defaultProviderId: 'anthropic', defaultModel: 'claude-sonnet-5' } },
    });
    return { token, agentId: createAgent.json().id as string };
  }

  it('creates and reads back a runtime binding', async () => {
    const app = await buildApp({ db });
    const { token, agentId } = await setupOwnerAndAgent(app);

    const create = await app.inject({
      method: 'POST',
      url: '/api/runtime-bindings',
      headers: { authorization: `Bearer ${token}` },
      payload: { agentId, runtimeKind: 'native', workspacePath: '/workspaces/assistant' },
    });
    expect(create.statusCode).toBe(201);

    const get = await app.inject({
      method: 'GET',
      url: `/api/runtime-bindings/${create.json().id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().workspacePath).toBe('/workspaces/assistant');

    await app.close();
  });

  it('creates and reads back a runtime session', async () => {
    const app = await buildApp({ db });
    const { token, agentId } = await setupOwnerAndAgent(app);

    const binding = await app.inject({
      method: 'POST',
      url: '/api/runtime-bindings',
      headers: { authorization: `Bearer ${token}` },
      payload: { agentId, runtimeKind: 'native', workspacePath: '/ws' },
    });
    const dm = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { authorization: `Bearer ${token}` },
      payload: { participantId: agentId, participantType: 'agent' },
    });

    const create = await app.inject({
      method: 'POST',
      url: '/api/runtime-sessions',
      headers: { authorization: `Bearer ${token}` },
      payload: { agentId, conversationId: dm.json().id, runtimeBindingId: binding.json().id },
    });
    expect(create.statusCode).toBe(201);

    const get = await app.inject({
      method: 'GET',
      url: `/api/runtime-sessions/${create.json().id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().status).toBe('idle');

    await app.close();
  });

  it('invokes an agent and returns its persisted response message', async () => {
    const app = await buildApp({ db, respond: async ({ agentId }) => ({ body: `hi from ${agentId}` }) });
    const { token, agentId } = await setupOwnerAndAgent(app);
    const dm = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { authorization: `Bearer ${token}` },
      payload: { participantId: agentId, participantType: 'agent' },
    });

    const invoke = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/runs`,
      headers: { authorization: `Bearer ${token}` },
      payload: { conversationId: dm.json().id },
    });
    expect(invoke.statusCode).toBe(201);
    expect(invoke.json().message.body).toBe(`hi from ${agentId}`);

    await app.close();
  });
});
