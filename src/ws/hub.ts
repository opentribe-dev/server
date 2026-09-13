import type Database from 'better-sqlite3';
import type { WebSocket } from 'ws';

interface EventRow {
  seq: number;
  topic: string;
  type: string;
  payload: string;
  created_at: string;
}

export interface BroadcastEvent {
  seq: number;
  topic: string;
  type: string;
  payload: unknown;
  ts: string;
}

export class ConnectionHub {
  private sockets = new Map<WebSocket, Set<string>>();

  constructor(private db: Database.Database) {}

  publish(topic: string, type: string, payload: unknown): BroadcastEvent {
    const createdAt = new Date().toISOString();
    const info = this.db
      .prepare('INSERT INTO event_log (topic, type, payload, created_at) VALUES (?, ?, ?, ?)')
      .run(topic, type, JSON.stringify(payload), createdAt);
    const event: BroadcastEvent = {
      seq: Number(info.lastInsertRowid),
      topic,
      type,
      payload,
      ts: createdAt,
    };
    this.broadcastToTopic(event);
    return event;
  }

  subscribe(socket: WebSocket, topics: string[]): void {
    this.sockets.set(socket, new Set(topics));
  }

  unsubscribe(socket: WebSocket): void {
    this.sockets.delete(socket);
  }

  replaySince(topics: string[], sinceSeq: number): BroadcastEvent[] {
    if (topics.length === 0) return [];
    const placeholders = topics.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM event_log WHERE topic IN (${placeholders}) AND seq > ? ORDER BY seq ASC`)
      .all(...topics, sinceSeq) as EventRow[];
    return rows.map((r) => ({
      seq: r.seq,
      topic: r.topic,
      type: r.type,
      payload: JSON.parse(r.payload),
      ts: r.created_at,
    }));
  }

  private broadcastToTopic(event: BroadcastEvent): void {
    for (const [socket, topics] of this.sockets) {
      if (topics.has(event.topic) && socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    }
  }
}
