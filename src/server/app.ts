import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { STEP } from '../shared/balance';
import { parseMessage } from '../shared/protocol';
import { Room, send } from './room';
import type { Peer } from './room';

export async function createApplication(development = false) {
  const rooms = new Map<string, Room>();
  const root = resolve(import.meta.dirname, '../..');
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };
  const server = createServer(async (request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"ok":true}');
      return;
    }
    if (vite) {
      vite.middlewares(request, response);
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const base = resolve(root, 'dist');
      const file = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(base + sep)) {
        response.writeHead(403);
        response.end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  const vite = development
    ? await (
        await import('vite')
      ).createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
    : null;
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws') {
      if (!development) socket.destroy();
      return;
    }
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.host) {
          socket.destroy();
          return;
        }
      } catch {
        socket.destroy();
        return;
      }
    }
    sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit('connection', ws));
  });
  const peers = new Set<Peer>();
  sockets.on('connection', (socket) => {
    const peer: Peer = { socket, room: null, id: 0, seq: -1, alive: true };
    peers.add(peer);
    let count = 0,
      window = Date.now();
    socket.on('pong', () => {
      peer.alive = true;
    });
    socket.on('error', () => socket.close());
    socket.on('message', (raw) => {
      if (Date.now() - window > 1000) {
        count = 0;
        window = Date.now();
      }
      if (++count > 150) {
        socket.close(1008, 'Too many messages');
        return;
      }
      const message = parseMessage(raw.toString());
      if (!message) {
        send(peer, { type: 'error', message: 'Invalid message.' });
        return;
      }
      if (message.type === 'ping') {
        send(peer, { type: 'pong', sent: message.sent });
        return;
      }
      if (message.type === 'leave') {
        leave(peer);
        send(peer, { type: 'left' });
        return;
      }
      if (message.type === 'create' || message.type === 'practice' || message.type === 'join') {
        if (peer.room) {
          send(peer, { type: 'error', message: 'Leave your current room first.' });
          return;
        }
        if (message.type === 'create' || message.type === 'practice') {
          if (rooms.size >= 200) {
            send(peer, { type: 'error', message: 'Server full. Try again shortly.' });
            return;
          }
          const mode = message.type === 'practice' ? 'practice' : 'duel';
          let room = new Room(mode);
          while (rooms.has(room.code)) room = new Room(mode);
          rooms.set(room.code, room);
          room.join(peer, message.champion);
        } else if (message.type === 'join') {
          const room = rooms.get(message.code);
          if (!room || !room.join(peer, message.champion))
            send(peer, {
              type: 'error',
              message:
                room?.mode === 'practice'
                  ? 'This is a solo practice session.'
                  : room
                    ? 'This room already has two players.'
                    : 'Room not found. Check the code.',
            });
        }
      }
      if (message.type === 'ready') peer.room?.setReady(peer);
      if (message.type === 'select-champion') peer.room?.selectChampion(peer, message.champion);
      if (message.type === 'reset-practice') peer.room?.resetPractice();
      if (message.type === 'input') peer.room?.enqueue(peer, message.seq, message.input);
    });
    socket.on('close', () => {
      leave(peer);
      peers.delete(peer);
    });
  });
  function leave(peer: Peer) {
    const room = peer.room;
    if (!room) return;
    room.leave(peer);
    if (room.peers.every((p) => !p)) rooms.delete(room.code);
  }
  let previous = performance.now(),
    accumulator = 0,
    ticks = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    accumulator += Math.min((now - previous) / 1000, 0.25);
    previous = now;
    while (accumulator >= STEP) {
      for (const room of rooms.values()) room.step();
      accumulator -= STEP;
      if (++ticks % 3 === 0) for (const room of rooms.values()) room.broadcast();
    }
  }, 8);
  const heartbeat = setInterval(() => {
    for (const peer of peers) {
      if (!peer.alive) {
        peer.socket.terminate();
        continue;
      }
      peer.alive = false;
      peer.socket.ping();
    }
  }, 15_000);

  return {
    server,
    rooms,
    async close() {
      clearInterval(timer);
      clearInterval(heartbeat);
      for (const peer of peers) peer.socket.terminate();
      sockets.close();
      await vite?.close();
      if (server.listening)
        await new Promise<void>((done, reject) => server.close((error) => (error ? reject(error) : done())));
    },
  };
}
