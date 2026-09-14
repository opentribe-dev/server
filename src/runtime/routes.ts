import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAgent } from '../agents/repository.js';
import { requireAuth } from '../auth/middleware.js';
import type { ConnectionHub } from '../ws/hub.js';
import { createRuntimeBinding, getRuntimeBinding } from './bindings.js';
import { MaxHopCountExceededError, runAgentTurn, type RespondFn } from './engine.js';
import { createRuntimeSession, getRuntimeSession } from './sessions.js';

const CreateBindingBodySchema = z.object({
  agentId: z.string().min(1),
  runtimeKind: z.enum(['native', 'claude-code', 'codex', 'gemini-cli']),
  workspacePath: z.string().min(1),
});

const CreateSessionBodySchema = z.object({
  agentId: z.string().min(1),
  conversationId: z.string().min(1),
  runtimeBindingId: z.string().min(1),
});

const InvokeAgentBodySchema = z.object({
  conversationId: z.string().min(1),
});

export function registerRuntimeRoutes(app: FastifyInstance, hub: ConnectionHub, respond: RespondFn): void {
  app.post('/api/runtime-bindings', { preHandler: requireAuth }, async (request, reply) => {
    const body = CreateBindingBodySchema.parse(request.body);
    if (!getAgent(app.db, body.agentId)) {
      reply.code(404).send({ error: 'agent_not_found' });
      return;
    }
    reply.code(201).send(createRuntimeBinding(app.db, body));
  });

  app.get('/api/runtime-bindings/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const binding = getRuntimeBinding(app.db, id);
    if (!binding) {
      reply.code(404).send({ error: 'runtime_binding_not_found' });
      return;
    }
    reply.send(binding);
  });

  app.post('/api/runtime-sessions', { preHandler: requireAuth }, async (request, reply) => {
    const body = CreateSessionBodySchema.parse(request.body);
    if (!getRuntimeBinding(app.db, body.runtimeBindingId)) {
      reply.code(404).send({ error: 'runtime_binding_not_found' });
      return;
    }
    reply.code(201).send(createRuntimeSession(app.db, body));
  });

  app.get('/api/runtime-sessions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getRuntimeSession(app.db, id);
    if (!session) {
      reply.code(404).send({ error: 'runtime_session_not_found' });
      return;
    }
    reply.send(session);
  });

  app.post('/api/agents/:id/runs', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!getAgent(app.db, id)) {
      reply.code(404).send({ error: 'agent_not_found' });
      return;
    }
    const body = InvokeAgentBodySchema.parse(request.body);
    try {
      const outcome = await runAgentTurn(
        { db: app.db, hub, respond },
        { agentId: id, conversationId: body.conversationId }
      );
      reply.code(201).send(outcome);
    } catch (err) {
      if (err instanceof MaxHopCountExceededError) {
        reply.code(400).send({ error: 'max_hop_count_exceeded' });
        return;
      }
      throw err;
    }
  });
}
