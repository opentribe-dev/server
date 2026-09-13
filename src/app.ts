import websocketPlugin from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { registerAgentRoutes } from './agents/routes.js';
import { registerAuthRoutes } from './auth/routes.js';
import { ConnectionHub } from './ws/hub.js';
import { registerWsRoutes } from './ws/routes.js';

export interface BuildAppOptions {
  db: Database.Database;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('db', opts.db);
  const hub = new ConnectionHub(opts.db);
  app.decorate('hub', hub);
  await app.register(websocketPlugin);

  app.get('/api/health', async () => ({ ok: true }));
  registerAuthRoutes(app);
  registerAgentRoutes(app);
  registerWsRoutes(app, hub);

  return app;
}
