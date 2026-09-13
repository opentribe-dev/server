import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';

describe('auth routes', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('allows the first /api/auth/setup call and rejects the second with 409', async () => {
    const app = await buildApp({ db });

    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'owner@example.com', displayName: 'Owner', password: 'super-secret-1' },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().token).toBeTypeOf('string');
    expect(first.json().user.role).toBe('owner');

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'other@example.com', displayName: 'Other', password: 'super-secret-2' },
    });
    expect(second.statusCode).toBe(409);

    await app.close();
  });

  it('logs in with correct credentials and rejects incorrect ones', async () => {
    const app = await buildApp({ db });
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'owner@example.com', displayName: 'Owner', password: 'super-secret-1' },
    });

    const badLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@example.com', password: 'wrong-password' },
    });
    expect(badLogin.statusCode).toBe(401);

    const goodLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@example.com', password: 'super-secret-1' },
    });
    expect(goodLogin.statusCode).toBe(200);
    expect(goodLogin.json().token).toBeTypeOf('string');

    await app.close();
  });

  it('requires a valid bearer token for /api/auth/me', async () => {
    const app = await buildApp({ db });
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'owner@example.com', displayName: 'Owner', password: 'super-secret-1' },
    });
    const { token } = setup.json();

    const unauthenticated = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(unauthenticated.statusCode).toBe(401);

    const authenticated = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(authenticated.statusCode).toBe(200);
    expect(authenticated.json().email).toBe('owner@example.com');

    await app.close();
  });
});
