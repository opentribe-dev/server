import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/migrate.js';
import { claimNextJob, completeJob, enqueueJob, failJob } from './repository.js';

describe('jobs repository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('enqueues and claims a due job', () => {
    enqueueJob(db, { type: 'noop', payload: { x: 1 } });
    const claimed = claimNextJob(db);
    expect(claimed?.type).toBe('noop');
    expect(claimed?.status).toBe('running');
    expect(claimed?.payload).toEqual({ x: 1 });
  });

  it('does not claim a job scheduled in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    enqueueJob(db, { type: 'noop', payload: {}, runAt: future });
    expect(claimNextJob(db)).toBeUndefined();
  });

  it('collapses duplicate pending enqueues sharing a dedupeKey', () => {
    enqueueJob(db, { type: 'summarize', payload: { conversationId: 'c1' }, dedupeKey: 'summarize:c1' });
    enqueueJob(db, { type: 'summarize', payload: { conversationId: 'c1' }, dedupeKey: 'summarize:c1' });
    const row = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'pending'").get() as { n: number };
    expect(row.n).toBe(1);
  });

  it('allows a fresh enqueue with the same dedupeKey once the prior job is running', () => {
    enqueueJob(db, { type: 'summarize', payload: { conversationId: 'c1' }, dedupeKey: 'summarize:c1' });
    claimNextJob(db);
    enqueueJob(db, { type: 'summarize', payload: { conversationId: 'c1' }, dedupeKey: 'summarize:c1' });
    const row = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'pending'").get() as { n: number };
    expect(row.n).toBe(1);
  });

  it('completeJob marks a job done', () => {
    enqueueJob(db, { type: 'noop', payload: {} });
    const claimed = claimNextJob(db)!;
    completeJob(db, claimed.id);
    const row = db.prepare('SELECT status FROM jobs WHERE id = ?').get(claimed.id) as { status: string };
    expect(row.status).toBe('done');
  });

  it('failJob marks a job failed, records the error, and increments attempts', () => {
    enqueueJob(db, { type: 'noop', payload: {} });
    const claimed = claimNextJob(db)!;
    failJob(db, claimed.id, 'boom');
    const row = db.prepare('SELECT status, attempts, last_error FROM jobs WHERE id = ?').get(claimed.id) as {
      status: string;
      attempts: number;
      last_error: string;
    };
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBe('boom');
  });
});
