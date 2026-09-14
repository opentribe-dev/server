import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAgent } from '../agents/repository.js';
import { requireAuth } from '../auth/middleware.js';
import { can, type Role } from '../permissions/model.js';
import { getUserById } from '../users/repository.js';
import { addParticipant, createConversation, getConversation, listConversationsForParticipant, removeParticipant } from './repository.js';

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

const AddMemberBodySchema = z.object({
  participantId: z.string().min(1),
  participantType: z.enum(['user', 'agent']),
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

  app.post('/api/conversations/:id/members', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const conversation = getConversation(app.db, id);
    if (!conversation) {
      reply.code(404).send({ error: 'conversation_not_found' });
      return;
    }
    if (conversation.kind !== 'group') {
      reply.code(400).send({ error: 'not_a_group' });
      return;
    }
    if (!can(request.user!.role as Role, 'group:manage_members')) {
      reply.code(403).send({ error: 'forbidden' });
      return;
    }
    const body = AddMemberBodySchema.parse(request.body);
    if (!participantExists(app, body.participantId, body.participantType)) {
      reply.code(404).send({ error: 'participant_not_found' });
      return;
    }
    addParticipant(app.db, id, { participantId: body.participantId, participantType: body.participantType });
    reply.code(204).send();
  });

  app.delete('/api/conversations/:id/members/:participantId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, participantId } = request.params as { id: string; participantId: string };
    const conversation = getConversation(app.db, id);
    if (!conversation) {
      reply.code(404).send({ error: 'conversation_not_found' });
      return;
    }
    if (conversation.kind !== 'group') {
      reply.code(400).send({ error: 'not_a_group' });
      return;
    }
    if (!can(request.user!.role as Role, 'group:manage_members')) {
      reply.code(403).send({ error: 'forbidden' });
      return;
    }
    removeParticipant(app.db, id, participantId);
    reply.code(204).send();
  });
}
