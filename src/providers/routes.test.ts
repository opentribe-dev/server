import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { createSession } from '../auth/session.js';
import { runMigrations } from '../db/migrate.js';
import { createUser } from '../users/repository.js';

describe('provider routes', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
  });

  async function setupOwner(app: Awaited<ReturnType<typeof buildApp>>) {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'owner@example.com', displayName: 'Owner', password: 'super-secret-1' },
    });
    return setup.json().token as string;
  }

  it('lets an owner create a provider and never echoes the api key back', async () => {
    const app = await buildApp({ db });
    const token = await setupOwner(app);

    const create = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: 'anthropic-default', kind: 'anthropic', apiKey: 'sk-secret' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().apiKey).toBeUndefined();
    expect(create.json().hasApiKey).toBe(true);

    await app.close();
  });

  it('rejects provider creation from a member-role user', async () => {
    const app = await buildApp({ db });
    await setupOwner(app);
    const member = createUser(db, { email: 'member@example.com', displayName: 'Member', passwordHash: 'x', role: 'member' });
    const memberToken = createSession(db, member.id);

    const create = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { id: 'anthropic-default', kind: 'anthropic', apiKey: 'sk-secret' },
    });
    expect(create.statusCode).toBe(403);

    await app.close();
  });

  it('lists providers without api keys', async () => {
    const app = await buildApp({ db });
    const token = await setupOwner(app);
    await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: 'anthropic-default', kind: 'anthropic', apiKey: 'sk-secret' },
    });

    const list = await app.inject({ method: 'GET', url: '/api/providers', headers: { authorization: `Bearer ${token}` } });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].apiKey).toBeUndefined();

    await app.close();
  });

  it('returns 404 for models on an unknown provider', async () => {
    const app = await buildApp({ db });
    const token = await setupOwner(app);

    const models = await app.inject({
      method: 'GET',
      url: '/api/providers/nonexistent/models',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(models.statusCode).toBe(404);

    await app.close();
  });

  it('proxies GET /api/providers/:id/models for an anthropic provider (static list, no network)', async () => {
    const app = await buildApp({ db });
    const token = await setupOwner(app);
    await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: 'anthropic-default', kind: 'anthropic', apiKey: 'sk-secret' },
    });

    const models = await app.inject({
      method: 'GET',
      url: '/api/providers/anthropic-default/models',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(models.statusCode).toBe(200);
    expect(models.json().length).toBeGreaterThan(0);

    await app.close();
  });

  it('rejects creating a remote-kind provider with no apiKey (400, not 201)', async () => {
    const app = await buildApp({ db });
    const token = await setupOwner(app);

    const create = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: 'anthropic-default', kind: 'anthropic' },
    });
    expect(create.statusCode).toBe(400);

    await app.close();
  });

  it('rejects creating an openai-compatible provider with an apiKey but no baseUrl (400, not 201)', async () => {
    const app = await buildApp({ db });
    const token = await setupOwner(app);

    const create = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: 'compat-default', kind: 'openai-compatible', apiKey: 'sk-secret' },
    });
    expect(create.statusCode).toBe(400);

    await app.close();
  });

  it('still creates a valid remote-kind provider with both apiKey and baseUrl (no regression)', async () => {
    const app = await buildApp({ db });
    const token = await setupOwner(app);

    const create = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: 'compat-default', kind: 'openai-compatible', apiKey: 'sk-secret', baseUrl: 'https://my-local-server/v1' },
    });
    expect(create.statusCode).toBe(201);

    await app.close();
  });

  it('still creates an agentd-backed provider (ollama) with neither apiKey nor baseUrl', async () => {
    const app = await buildApp({ db });
    const token = await setupOwner(app);

    const create = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: 'ollama-default', kind: 'ollama' },
    });
    expect(create.statusCode).toBe(201);

    await app.close();
  });

  it('returns 502 when a remote provider is unreachable while listing models', async () => {
    const app = await buildApp({ db });
    const token = await setupOwner(app);
    await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: 'openai-default', kind: 'openai', apiKey: 'sk-secret' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    const models = await app.inject({
      method: 'GET',
      url: '/api/providers/openai-default/models',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(models.statusCode).toBe(502);

    await app.close();
  });
});
