import websocketPlugin from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { ZodError } from 'zod';
import { registerAgentRoutes } from './agents/routes.js';
import { registerApprovalRoutes } from './approvals/routes.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerConversationRoutes } from './conversations/routes.js';
import { registerMessageRoutes } from './messages/routes.js';
import { registerConversationSummaryRoutes, registerMemoryFactRoutes } from './memory/routes.js';
import { registerProviderRoutes } from './providers/routes.js';
import { type RespondFn } from './runtime/engine.js';
import { createProviderRespond } from './providers/respond.js';
import { registerRuntimeRoutes } from './runtime/routes.js';
import { ConnectionHub } from './ws/hub.js';
import { registerWsRoutes } from './ws/routes.js';

export interface BuildAppOptions {
  db: Database.Database;
  respond?: RespondFn;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('db', opts.db);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'invalid_request', issues: error.issues });
      return;
    }
    reply.send(error);
  });
  const hub = new ConnectionHub(opts.db);
  app.decorate('hub', hub);
  await app.register(websocketPlugin);

  app.get('/api/v1/health', async () => ({ ok: true }));
  registerAuthRoutes(app);
  registerAgentRoutes(app);
  registerConversationRoutes(app);
  const respond = opts.respond ?? createProviderRespond(opts.db);
  registerMessageRoutes(app, hub, respond);
  registerMemoryFactRoutes(app);
  registerConversationSummaryRoutes(app);
  registerProviderRoutes(app);
  registerRuntimeRoutes(app, hub, respond);
  registerApprovalRoutes(app);
  registerWsRoutes(app, hub);

  return app;
}
