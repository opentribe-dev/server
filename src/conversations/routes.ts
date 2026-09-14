import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAgent } from '../agents/repository.js';
import { requireAuth } from '../auth/middleware.js';
import { can, type Role } from '../permissions/model.js';
import { getUserById } from '../users/repository.js';
import { createConversation, listConversationsForParticipant } from './repository.js';

const CreateDmBodySchema = z.object({
  participantId: z.string().min(1),
  participantType: z.enum(['user', 'agent']).default('user'),
});

const CreateGroupBodySchema = z.object({
  name: z.string().min(1),
  participants: z
    .array(z.object({ participantId: z.string().min(1), participantType: z.enum(['user', 'agent']) }))
    .min(1),
});

function participantExists(
  app: FastifyInstance,
  participantId: string,
  participantType: 'user' | 'agent'
): boolean {
  if (participantType === 'user') return getUserById(app.db, participantId) !== undefined;
  return getAgent(app.db, participantId) !== undefined;
}

export function registerConversationRoutes(app: FastifyInstance): void {
  app.post('/api/conversations', { preHandler: requireAuth }, async (request, reply) => {
    const body = CreateDmBodySchema.parse(request.body);
    if (!participantExists(app, body.participantId, body.participantType)) {
      reply.code(404).send({ error: 'participant_not_found' });
      return;
    }
    const conversation = createConversation(app.db, {
      kind: 'dm',
      name: null,
      participants: [
        { participantId: request.user!.id, participantType: 'user' },
        { participantId: body.participantId, participantType: body.participantType },
      ],
    });
    reply.code(201).send(conversation);
  });

  app.post('/api/conversations/group', { preHandler: requireAuth }, async (request, reply) => {
    if (!can(request.user!.role as Role, 'conversation:create_group')) {
      reply.code(403).send({ error: 'forbidden' });
      return;
    }
    const body = CreateGroupBodySchema.parse(request.body);
    for (const p of body.participants) {
      if (!participantExists(app, p.participantId, p.participantType)) {
        reply.code(404).send({ error: 'participant_not_found' });
        return;
      }
    }
    const conversation = createConversation(app.db, {
      kind: 'group',
      name: body.name,
      participants: [{ participantId: request.user!.id, participantType: 'user' }, ...body.participants],
    });
    reply.code(201).send(conversation);
  });

  app.get('/api/conversations', { preHandler: requireAuth }, async (request, reply) => {
    reply.send(listConversationsForParticipant(app.db, request.user!.id));
  });
}
