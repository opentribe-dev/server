import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { ApprovalAlreadyResolvedError, getApproval, listPendingApprovals, resolveApproval } from './repository.js';

const RespondBodySchema = z.object({
  decision: z.enum(['approve', 'deny']),
});

export function registerApprovalRoutes(app: FastifyInstance): void {
  app.get('/api/v1/approvals', { preHandler: requireAuth }, async (_request, reply) => {
    reply.send(listPendingApprovals(app.db));
  });

  app.post('/api/v1/approvals/:id/respond', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!getApproval(app.db, id)) {
      reply.code(404).send({ error: 'approval_not_found' });
      return;
    }
    const body = RespondBodySchema.parse(request.body);
    try {
      reply.send(resolveApproval(app.db, id, body.decision));
    } catch (err) {
      if (err instanceof ApprovalAlreadyResolvedError) {
        reply.code(409).send({ error: 'already_resolved' });
        return;
      }
      throw err;
    }
  });
}
