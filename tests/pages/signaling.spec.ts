import { test, expect } from '@playwright/test';
import WebSocket from 'ws';

const service = 'http://127.0.0.1:3190';
const origin = 'http://127.0.0.1:3180';

function connect(code: string, token?: string) {
  return new Promise<{ socket: WebSocket; message: { type: string; player?: number; message?: string } }>(
    (resolve, reject) => {
      const socket = new WebSocket(
        `${service.replace('http:', 'ws:')}/rooms/${code}/socket${token ? `?host=${token}` : ''}`,
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
    expect(host.message).toEqual({ type: 'welcome', player: 0 });
    const duplicate = await connect(code, token);
    expect(duplicate.message.type).toBe('error');
    duplicate.socket.close();
    const guest = await connect(code);
    expect(guest.message).toEqual({ type: 'welcome', player: 1 });
    guest.socket.close();
  } finally {
    host.socket.close();
  }
});
