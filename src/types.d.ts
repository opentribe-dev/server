import 'fastify';
import type Database from 'better-sqlite3';
import type { ConnectionHub } from './ws/hub.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database;
    hub: ConnectionHub;
  }
  interface FastifyRequest {
    user?: { id: string; role: string };
  }
}
