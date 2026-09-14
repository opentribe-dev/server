import { ApprovalRequestSchema, type ApprovalRequest, type ApprovalStatus } from '@opencrew/protocol';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

interface ApprovalRow {
  id: string;
  run_id: string;
  agent_id: string;
  action: string;
  details: string;
  status: ApprovalStatus;
  created_at: string;
  resolved_at: string | null;
}

function rowToApproval(row: ApprovalRow): ApprovalRequest {
  return ApprovalRequestSchema.parse({
    id: row.id,
    runId: row.run_id,
    agentId: row.agent_id,
    action: row.action,
    details: JSON.parse(row.details),
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  });
}

export class ApprovalAlreadyResolvedError extends Error {}

export function createApproval(
  db: Database.Database,
  input: { runId: string; agentId: string; action: string; details: Record<string, unknown> }
): ApprovalRequest {
  const row: ApprovalRow = {
    id: randomUUID(),
    run_id: input.runId,
    agent_id: input.agentId,
    action: input.action,
    details: JSON.stringify(input.details),
    status: 'pending',
    created_at: new Date().toISOString(),
    resolved_at: null,
  };
  db.prepare(
    `INSERT INTO approvals (id, run_id, agent_id, action, details, status, created_at, resolved_at)
     VALUES (@id, @run_id, @agent_id, @action, @details, @status, @created_at, @resolved_at)`
  ).run(row);
  return rowToApproval(row);
}

export function getApproval(db: Database.Database, id: string): ApprovalRequest | undefined {
  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as ApprovalRow | undefined;
  return row ? rowToApproval(row) : undefined;
}

export function listPendingApprovals(db: Database.Database): ApprovalRequest[] {
  const rows = db
    .prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC")
    .all() as ApprovalRow[];
  return rows.map(rowToApproval);
}

export function resolveApproval(
  db: Database.Database,
  id: string,
  decision: 'approve' | 'deny'
): ApprovalRequest {
  const existing = getApproval(db, id);
  if (!existing) {
    throw new Error('approval_not_found');
  }
  if (existing.status !== 'pending') {
    throw new ApprovalAlreadyResolvedError(`approval ${id} already resolved with status ${existing.status}`);
  }
  const status: ApprovalStatus = decision === 'approve' ? 'approved' : 'denied';
  db.prepare('UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ?').run(
    status,
    new Date().toISOString(),
    id
  );
  return getApproval(db, id)!;
}
