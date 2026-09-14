import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { JobRunner } from '../src/jobs/runner.js';
import { SUMMARIZE_CONVERSATION_JOB_TYPE, updateConversationSummary } from '../src/memory/summary.js';

describe('memory end-to-end: MemoryFact dedup and conversation summary regeneration', () => {
  let db: Database.Database;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    app = await buildApp({ db });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('deduplicates a memory fact created twice through the real REST surface', async () => {
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
    const agentId = createAgent.json().id as string;

    const first = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/memory-facts`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: 'User prefers terse replies.' },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/memory-facts`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: '  User PREFERS terse replies.  ' },
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);

    const list = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/memory-facts`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.json()).toHaveLength(1);
  });

  it('collapses a burst of messages into one pending job, and running it produces a fetchable summary', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'owner@example.com', displayName: 'Owner', password: 'super-secret-1' },
    });
    const token = setup.json().token as string;
    const other = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Assistant', modelPolicy: { defaultProviderId: 'anthropic', defaultModel: 'claude-sonnet-5' } },
    });
    const dm = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { authorization: `Bearer ${token}` },
      payload: { participantId: other.json().id, participantType: 'agent' },
    });
    const conversationId = dm.json().id as string;

    for (const body of ['first', 'second', 'third']) {
      await app.inject({
        method: 'POST',
        url: `/api/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body },
      });
    }

    const pendingCount = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE type = ? AND status = 'pending'").get(
      SUMMARIZE_CONVERSATION_JOB_TYPE
    ) as { n: number };
    expect(pendingCount.n).toBe(1);

    const runner = new JobRunner(db, {
      [SUMMARIZE_CONVERSATION_JOB_TYPE]: async (jobDb, payload) => {
        const { conversationId: cid } = payload as { conversationId: string };
        await updateConversationSummary(jobDb, cid);
      },
    });
    const ran = await runner.runOnce();
    expect(ran).toBe(true);

    const summary = await app.inject({
      method: 'GET',
      url: `/api/conversations/${conversationId}/summary`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().summary).toContain('first');
    expect(summary.json().summary).toContain('third');
  });
});
