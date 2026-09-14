import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface JobRecord {
  id: string;
  type: string;
  payload: unknown;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  lastError: string | null;
  runAt: string;
  createdAt: string;
  updatedAt: string;
}

interface JobRow {
  id: string;
  type: string;
  payload: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  last_error: string | null;
  run_at: string;
  created_at: string;
  updated_at: string;
}

function rowToJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload),
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    runAt: row.run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function enqueueJob(
  db: Database.Database,
  input: { type: string; payload: unknown; dedupeKey?: string; runAt?: string }
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO jobs (id, type, payload, status, attempts, last_error, dedupe_key, run_at, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', 0, NULL, ?, ?, ?, ?)`
  ).run(randomUUID(), input.type, JSON.stringify(input.payload), input.dedupeKey ?? null, input.runAt ?? now, now, now);
}

export function claimNextJob(db: Database.Database, now: string = new Date().toISOString()): JobRecord | undefined {
  const claim = db.transaction((claimNow: string) => {
    const row = db
      .prepare(`SELECT * FROM jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at ASC, rowid ASC LIMIT 1`)
      .get(claimNow) as JobRow | undefined;
    if (!row) return undefined;
    db.prepare(`UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'pending'`).run(claimNow, row.id);
    return rowToJob({ ...row, status: 'running', updated_at: claimNow });
  });
  return claim(now);
}

export function completeJob(db: Database.Database, id: string): void {
  db.prepare(`UPDATE jobs SET status = 'done', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
}

export function failJob(db: Database.Database, id: string, error: string): void {
  const now = new Date().toISOString();
  db.prepare(`UPDATE jobs SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`).run(
    error,
    now,
    id
  );
}
