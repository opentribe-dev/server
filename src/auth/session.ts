import type Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createSession(db: Database.Database, userId: string): string {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    new Date(now).toISOString(),
    new Date(now + SESSION_TTL_MS).toISOString()
  );
  return token;
}

export function verifySessionToken(db: Database.Database, token: string): string | undefined {
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as
    | { user_id: string; expires_at: string }
    | undefined;
  if (!row) return undefined;
  if (new Date(row.expires_at).getTime() < Date.now()) return undefined;
  return row.user_id;
}

export function revokeSession(db: Database.Database, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
