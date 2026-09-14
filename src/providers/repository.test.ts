import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { createProviderConfig, getProviderConfig, listProviderConfigs } from './repository.js';

describe('provider config repository', () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function freshDb() {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencrew-providers-'));
    const db = openDatabase(dataDir);
    runMigrations(db);
    return db;
  }

  it('creates a provider config with a caller-supplied id and reads it back', () => {
    const db = freshDb();
    const config = createProviderConfig(db, { id: 'anthropic-default', kind: 'anthropic', apiKey: 'sk-test' });
    expect(config.id).toBe('anthropic-default');
    expect(config.apiKey).toBe('sk-test');
    expect(getProviderConfig(db, 'anthropic-default')?.kind).toBe('anthropic');
    db.close();
  });

  it('allows an agentd-backed provider with no stored api key', () => {
    const db = freshDb();
    const config = createProviderConfig(db, { id: 'my-claude-subscription', kind: 'claude-subscription' });
    expect(config.apiKey).toBeNull();
    db.close();
  });

  it('lists all configured providers', () => {
    const db = freshDb();
    createProviderConfig(db, { id: 'anthropic-default', kind: 'anthropic', apiKey: 'sk-test' });
    createProviderConfig(db, { id: 'openai-default', kind: 'openai', apiKey: 'sk-openai' });
    expect(listProviderConfigs(db)).toHaveLength(2);
    db.close();
  });

  it('rejects a duplicate id', () => {
    const db = freshDb();
    createProviderConfig(db, { id: 'anthropic-default', kind: 'anthropic', apiKey: 'sk-test' });
    expect(() => createProviderConfig(db, { id: 'anthropic-default', kind: 'openai', apiKey: 'sk-other' })).toThrow();
    db.close();
  });
});
