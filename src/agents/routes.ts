import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { createAgent, listAgentsForOwner } from './repository.js';

const CreateAgentBodySchema = z.object({
  name: z.string().min(1),
  personality: z.string().default(''),
  modelPolicy: z.object({
    defaultProviderId: z.string().min(1),
    defaultModel: z.string().min(1),
  }),
});

export function registerAgentRoutes(app: FastifyInstance): void {
  app.post('/api/agents', { preHandler: requireAuth }, async (request, reply) => {
    const body = CreateAgentBodySchema.parse(request.body);
    const agent = createAgent(app.db, {
      ownerUserId: request.user!.id,
      name: body.name,
      personality: body.personality,
      modelPolicy: body.modelPolicy,
      permissions: { tools: [], canMessageAgents: true, canApproveOwnActions: false },
    });
    reply.code(201).send(agent);
  });

  app.get('/api/agents', { preHandler: requireAuth }, async (request, reply) => {
    reply.send(listAgentsForOwner(app.db, request.user!.id));
  });
}
