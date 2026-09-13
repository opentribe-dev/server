import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';

describe('agent routes', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  async function setupAndGetToken(app: Awaited<ReturnType<typeof buildApp>>) {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'owner@example.com', displayName: 'Owner', password: 'super-secret-1' },
    });
    return setup.json().token as string;
  }

  it('creates and lists agents for the authenticated user', async () => {
    const app = await buildApp({ db });
    const token = await setupAndGetToken(app);

    const create = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Researcher',
        modelPolicy: { defaultProviderId: 'anthropic', defaultModel: 'claude-sonnet-5' },
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().name).toBe('Researcher');

    const list = await app.inject({
      method: 'GET',
      url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    await app.close();
  });

  it('rejects agent creation without authentication', async () => {
    const app = await buildApp({ db });
    const response = await app.inject({
      method: 'POST',
      url: '/api/agents',
      payload: { name: 'Nope', modelPolicy: { defaultProviderId: 'anthropic', defaultModel: 'x' } },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
