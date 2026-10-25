import { test, expect } from '@playwright/test';
import WebSocket from 'ws';
import type { SignalMessage } from '../../src/shared/signaling';

const service = 'http://127.0.0.1:3190';
const origin = 'http://127.0.0.1:3180';

function connect(code: string, token?: string) {
  return new Promise<{ socket: WebSocket; message: { type: string; player?: number; message?: string } }>(
    (resolve, reject) => {
      const socket = new WebSocket(
        `${service.replace('http:', 'ws:')}/rooms/${code}/socket?v=2${token ? `&host=${token}` : ''}`,
        { origin },
      );
      socket.once('error', reject);
      socket.once('message', (raw) => resolve({ socket, message: JSON.parse(raw.toString()) }));
    },
  );
}

test('Cloudflare restricts origins and prevents claiming a host seat with only the room code', async ({
  request,
}) => {
  expect((await request.post(`${service}/rooms`)).status()).toBe(403);
  expect(
    (await request.post(`${service}/rooms`, { headers: { Origin: 'https://unrelated.example' } })).status(),
  ).toBe(403);
  const response = await request.post(`${service}/rooms`, { headers: { Origin: origin } });
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['cache-control']).toBe('no-store');
  const { code, token } = await response.json();
  const wrong = await connect(code, 'invalid-token');
  expect(wrong.message.type).toBe('error');
  wrong.socket.close();
  const missingHost = await connect(code);
  expect(missingHost.message.message).toContain('Room not found');
  missingHost.socket.close();
  const host = await connect(code, token);
  try {
    expect(host.message).toEqual({ type: 'welcome', player: 0, version: 2 });
    const duplicate = await connect(code, token);
    expect(duplicate.message.type).toBe('error');
    duplicate.socket.close();
    const guest = await connect(code);
    expect(guest.message).toEqual({ type: 'welcome', player: 1, version: 2 });
    guest.socket.close();
  } finally {
    host.socket.close();
  }
});

test('relay enforces sender roles, isolates guest sessions and bounds unacknowledged snapshots', async ({
  request,
}) => {
  const response = await request.post(`${service}/rooms`, { headers: { Origin: origin } });
  const { code, token } = await response.json();
  const host = await connect(code, token);
  const hostInbox: SignalMessage[] = [];
  host.socket.on('message', (raw) => hostInbox.push(JSON.parse(raw.toString())));
  const guest = await connect(code);
  const guestInbox: SignalMessage[] = [];
  guest.socket.on('message', (raw) => guestInbox.push(JSON.parse(raw.toString())));
  try {
    await expect.poll(() => hostInbox.find((m) => m.type === 'peer')).toBeTruthy();
    const session = (hostInbox.find((m) => m.type === 'peer') as { session: string }).session;
    const send = (socket: WebSocket, data: unknown, roomSession = session) =>
      socket.send(JSON.stringify({ type: 'relay', session: roomSession, from: 0, data }));
    send(guest.socket, { type: 'state', room: {} });
    send(guest.socket, { type: 'ready' }, 'old-guest-session');
    send(guest.socket, {
      type: 'input',
      seq: 1,
      input: { action: 'cast', spell: 'invalid', point: { x: 0, y: 0 } },
    });
    send(guest.socket, { type: 'ready' });
    await expect.poll(() => hostInbox.filter((m) => m.type === 'relay').length).toBe(1);
    expect(hostInbox.find((m) => m.type === 'relay')).toEqual({
      type: 'relay',
      from: 1,
      session,
      data: { type: 'ready' },
    });
    for (let i = 0; i < 6; i++) send(host.socket, { type: 'state', sequence: i });
    send(host.socket, { type: 'pong', sent: 7 });
    await expect.poll(() => guestInbox.filter((m) => m.type === 'relay').length).toBe(4);
    expect(
      guestInbox.filter((m) => m.type === 'relay' && (m.data as { type: string }).type === 'state'),
    ).toHaveLength(3);
    guest.socket.send(JSON.stringify({ type: 'ack', session }));
    send(guest.socket, { type: 'ping', sent: 1 });
    await expect.poll(() => hostInbox.filter((m) => m.type === 'relay').length).toBe(2);
    send(host.socket, { type: 'state', sequence: 7 });
    await expect.poll(() => guestInbox.filter((m) => m.type === 'relay').length).toBe(5);
  } finally {
    guest.socket.close();
    host.socket.close();
  }
});
