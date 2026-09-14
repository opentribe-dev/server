import { ProviderKindSchema } from '@opencrew/protocol';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { can, type Role } from '../permissions/model.js';
import { createProviderConfig, getProviderConfig, listProviderConfigs, type ProviderConfigRecord } from './repository.js';
import { resolveProviderClient } from './registry.js';

const CreateProviderBodySchema = z.object({
  id: z.string().min(1),
  kind: ProviderKindSchema,
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
});

function redact(config: ProviderConfigRecord) {
  const { apiKey, ...rest } = config;
  return { ...rest, hasApiKey: apiKey !== null };
}

export function registerProviderRoutes(app: FastifyInstance): void {
  app.post('/api/providers', { preHandler: requireAuth }, async (request, reply) => {
    if (!can(request.user!.role as Role, 'provider:manage')) {
      reply.code(403).send({ error: 'forbidden' });
      return;
    }
    const body = CreateProviderBodySchema.parse(request.body);
    const config = createProviderConfig(app.db, body);
    reply.code(201).send(redact(config));
  });

  app.get('/api/providers', { preHandler: requireAuth }, async (_request, reply) => {
    reply.send(listProviderConfigs(app.db).map(redact));
  });

  app.get('/api/providers/:id/models', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const config = getProviderConfig(app.db, id);
    if (!config) {
      reply.code(404).send({ error: 'provider_not_found' });
      return;
    }
    try {
      const client = resolveProviderClient(config);
      reply.send(await client.listModels());
    } catch (err) {
      reply.code(502).send({ error: 'provider_unavailable', message: (err as Error).message });
    }
  });
}
