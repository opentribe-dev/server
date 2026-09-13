import Fastify, { type FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { registerAuthRoutes } from './auth/routes.js';

export interface BuildAppOptions {
  db: Database.Database;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('db', opts.db);
  app.get('/api/health', async () => ({ ok: true }));
  registerAuthRoutes(app);
  return app;
}
