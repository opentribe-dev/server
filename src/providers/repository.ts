import type { ProviderKind } from '@opencrew/protocol';
import type Database from 'better-sqlite3';

export interface ProviderConfigRecord {
  id: string;
  kind: ProviderKind;
  apiKey: string | null;
  baseUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProviderConfigRow {
  id: string;
  kind: ProviderKind;
  api_key: string | null;
  base_url: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProviderConfig(row: ProviderConfigRow): ProviderConfigRecord {
  return {
    id: row.id,
    kind: row.kind,
    apiKey: row.api_key,
    baseUrl: row.base_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createProviderConfig(
  db: Database.Database,
  input: { id: string; kind: ProviderKind; apiKey?: string | null; baseUrl?: string | null }
): ProviderConfigRecord {
  const now = new Date().toISOString();
  const row: ProviderConfigRow = {
    id: input.id,
    kind: input.kind,
    api_key: input.apiKey ?? null,
    base_url: input.baseUrl ?? null,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO provider_configs (id, kind, api_key, base_url, created_at, updated_at)
     VALUES (@id, @kind, @api_key, @base_url, @created_at, @updated_at)`
  ).run(row);
  return rowToProviderConfig(row);
}

export function getProviderConfig(db: Database.Database, id: string): ProviderConfigRecord | undefined {
  const row = db.prepare('SELECT * FROM provider_configs WHERE id = ?').get(id) as ProviderConfigRow | undefined;
  return row ? rowToProviderConfig(row) : undefined;
}

export function listProviderConfigs(db: Database.Database): ProviderConfigRecord[] {
  const rows = db.prepare('SELECT * FROM provider_configs ORDER BY created_at ASC').all() as ProviderConfigRow[];
  return rows.map(rowToProviderConfig);
}
