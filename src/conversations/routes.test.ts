import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { createSession } from '../auth/session.js';
import { createUser } from '../users/repository.js';

describe('conversation routes', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  async function setupOwner(app: Awaited<ReturnType<typeof buildApp>>) {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'owner@example.com', displayName: 'Owner', password: 'super-secret-1' },
    });
    return { token: setup.json().token as string, userId: setup.json().user.id as string };
  }

  it('creates a dm with an existing user and lists it back', async () => {
    const app = await buildApp({ db });
    const { token } = await setupOwner(app);
    const bob = createUser(db, { email: 'bob@example.com', displayName: 'Bob', passwordHash: 'x', role: 'member' });

    const create = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { authorization: `Bearer ${token}` },
      payload: { participantId: bob.id, participantType: 'user' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().kind).toBe('dm');
    expect(create.json().participants).toHaveLength(2);

    const list = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    await app.close();
  });

  it('rejects a dm with a nonexistent participant', async () => {
    const app = await buildApp({ db });
    const { token } = await setupOwner(app);

    const create = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { authorization: `Bearer ${token}` },
      payload: { participantId: 'nonexistent', participantType: 'user' },
    });
    expect(create.statusCode).toBe(404);

    await app.close();
  });

  it('creates a named group with multiple participants', async () => {
    const app = await buildApp({ db });
    const { token } = await setupOwner(app);
    const bob = createUser(db, { email: 'bob@example.com', displayName: 'Bob', passwordHash: 'x', role: 'member' });
    const carol = createUser(db, { email: 'carol@example.com', displayName: 'Carol', passwordHash: 'y', role: 'member' });

    const create = await app.inject({
      method: 'POST',
      url: '/api/conversations/group',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Team',
        participants: [
          { participantId: bob.id, participantType: 'user' },
          { participantId: carol.id, participantType: 'user' },
        ],
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().name).toBe('Team');
    expect(create.json().participants).toHaveLength(3);

    await app.close();
  });

  it('rejects conversation creation without authentication', async () => {
    const app = await buildApp({ db });
    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      payload: { participantId: 'anyone', participantType: 'user' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
