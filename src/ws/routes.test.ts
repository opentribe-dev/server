import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';

describe('WebSocket delivery and reconnect/replay', () => {
  let db: Database.Database;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let baseUrl: string;
  let token: string;
  let userId: string;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    app = await buildApp({ db });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (typeof address === 'string' || address === null) throw new Error('expected AddressInfo');
    baseUrl = `127.0.0.1:${address.port}`;

    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { email: 'owner@example.com', displayName: 'Owner', password: 'super-secret-1' },
    });
    token = setup.json().token;
    userId = setup.json().user.id;
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  function waitForMessage(socket: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      socket.once('message', (data) => resolve(JSON.parse(data.toString())));
    });
  }

  function waitForOpen(socket: WebSocket): Promise<void> {
    return new Promise((resolve) => socket.once('open', () => resolve()));
  }

  it('delivers a live event published after the socket connects', async () => {
    const socket = new WebSocket(`ws://${baseUrl}/ws?token=${token}`);
    await waitForOpen(socket);

    const messagePromise = waitForMessage(socket);
    app.hub.publish(`user:${userId}`, 'user.updated', { hello: 'world' });
    const received = await messagePromise;

    expect(received.type).toBe('user.updated');
    expect(received.payload).toEqual({ hello: 'world' });
    socket.close();
  });

  it('replays events published while disconnected when reconnecting with sinceSeq', async () => {
    const firstSocket = new WebSocket(`ws://${baseUrl}/ws?token=${token}`);
    await waitForOpen(firstSocket);
    firstSocket.close();
    await new Promise((resolve) => firstSocket.once('close', resolve));

    const missedWhileDisconnected = app.hub.publish(`user:${userId}`, 'user.updated', { n: 1 });

    const secondSocket = new WebSocket(`ws://${baseUrl}/ws?token=${token}&sinceSeq=0`);
    const replayed = await waitForMessage(secondSocket);

    expect(replayed.seq).toBe(missedWhileDisconnected.seq);
    expect(replayed.payload).toEqual({ n: 1 });
    secondSocket.close();
  });

  it('closes the connection with 4001 for an invalid token', async () => {
    const socket = new WebSocket(`ws://${baseUrl}/ws?token=not-a-real-token`);
    const closeCode = await new Promise<number>((resolve) => socket.once('close', resolve));
    expect(closeCode).toBe(4001);
  });
});
