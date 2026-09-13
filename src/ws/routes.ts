import type { FastifyInstance } from 'fastify';
import { verifySessionToken } from '../auth/session.js';
import type { ConnectionHub } from './hub.js';

export function registerWsRoutes(app: FastifyInstance, hub: ConnectionHub): void {
  app.get('/ws', { websocket: true }, (socket, request) => {
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token') ?? '';
    const userId = verifySessionToken(app.db, token);
    if (!userId) {
      socket.close(4001, 'unauthorized');
      return;
    }

    const topics = [`user:${userId}`];
    hub.subscribe(socket, topics);

    const sinceSeqParam = url.searchParams.get('sinceSeq');
    if (sinceSeqParam !== null) {
      const missed = hub.replaySince(topics, Number(sinceSeqParam));
      for (const event of missed) {
        socket.send(JSON.stringify(event));
      }
    }

    socket.on('close', () => hub.unsubscribe(socket));
  });
}
