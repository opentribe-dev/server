import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { countUsers, createUser, getUserByEmail, getUserById } from '../users/repository.js';
import { requireAuth } from './middleware.js';
import { hashPassword, verifyPassword } from './password.js';
import { createSession } from './session.js';

const SetupBodySchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  password: z.string().min(8),
});

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post('/api/auth/setup', async (request, reply) => {
    if (countUsers(app.db) > 0) {
      reply.code(409).send({ error: 'already_initialized' });
      return;
    }
    const body = SetupBodySchema.parse(request.body);
    const user = createUser(app.db, {
      email: body.email,
      displayName: body.displayName,
      passwordHash: hashPassword(body.password),
      role: 'owner',
    });
    const token = createSession(app.db, user.id);
    reply.code(201).send({ token, user: { id: user.id, email: user.email, role: user.role } });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = LoginBodySchema.parse(request.body);
    const user = getUserByEmail(app.db, body.email);
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      reply.code(401).send({ error: 'invalid_credentials' });
      return;
    }
    const token = createSession(app.db, user.id);
    reply.code(200).send({ token, user: { id: user.id, email: user.email, role: user.role } });
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = getUserById(app.db, request.user!.id)!;
    reply.send({ id: user.id, email: user.email, role: user.role });
  });
}
