import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { createUser } from '../users/repository.js';
import { createSession, verifySessionToken } from './session.js';

describe('sessions', () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function freshDbWithUser() {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencrew-sessions-'));
    const db = openDatabase(dataDir);
    runMigrations(db);
    const user = createUser(db, {
      email: 'a@example.com',
      displayName: 'A',
      passwordHash: 'x',
      role: 'owner',
    });
    return { db, user };
  }

  it('creates a session token that resolves back to the user', () => {
    const { db, user } = freshDbWithUser();
    const token = createSession(db, user.id);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(verifySessionToken(db, token)).toBe(user.id);
    db.close();
  });

  it('returns undefined for an unknown token', () => {
    const { db } = freshDbWithUser();
    expect(verifySessionToken(db, 'nonexistent')).toBeUndefined();
    db.close();
  });
});
