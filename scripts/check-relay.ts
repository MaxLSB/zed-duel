import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { CHAMPIONS } from '../src/shared/champions';
import { RELAY_VERSION, type SignalMessage } from '../src/shared/signaling';

/** Exercise the deployed validator, rather than just its health endpoint. */
export async function checkRelay(service: string, origin: string) {
  const sockets: WebSocket[] = [];
  const connect = (code: string, token?: string) => {
    const url = new URL(`/rooms/${code}/socket`, service);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('v', String(RELAY_VERSION));
    if (token) url.searchParams.set('host', token);
    const socket = new WebSocket(url, { origin, handshakeTimeout: 10_000 });
    sockets.push(socket);
    const inbox: SignalMessage[] = [];
    let failure: Error | undefined;
    socket.on('error', (error) => {
      failure = error;
    });
    socket.on('message', (raw) => {
      try {
        inbox.push(JSON.parse(raw.toString()));
      } catch {
        failure = new Error('Relay returned malformed JSON');
      }
    });
    const waitFor = async (predicate: (message: SignalMessage) => boolean) => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if (failure) throw failure;
        const error = inbox.find((message) => message.type === 'error');
        if (error?.type === 'error') throw new Error(error.message);
        const message = inbox.find(predicate);
        if (message) return message;
        if (socket.readyState === WebSocket.CLOSED) throw new Error('Relay closed the connection');
        await delay(20);
      }
      throw new Error('Timed out waiting for relay');
    };
    return { socket, inbox, waitFor };
  };

  try {
    const response = await fetch(new URL('/rooms', service), {
      method: 'POST',
      headers: { Origin: origin },
      signal: AbortSignal.timeout(10_000),
    });
    assert(response.ok, `Relay room creation failed: HTTP ${response.status}`);
    const { code, token } = (await response.json()) as { code: string; token: string };
    const host = connect(code, token);
    assert.deepEqual(await host.waitFor((m) => m.type === 'welcome'), {
      type: 'welcome',
      player: 0,
      version: RELAY_VERSION,
    });
    const guest = connect(code);
    assert.deepEqual(await guest.waitFor((m) => m.type === 'welcome'), {
      type: 'welcome',
      player: 1,
      version: RELAY_VERSION,
    });
    const peer = await host.waitFor((m) => m.type === 'peer');
    assert(peer.type === 'peer');
    const expected = CHAMPIONS.flatMap((champion) => [
      { type: 'hello', champion },
      { type: 'select-champion', champion },
    ]);
    for (const data of [...expected, { type: 'ping', sent: 1 }]) {
      guest.socket.send(JSON.stringify({ type: 'relay', session: peer.session, data }));
    }
    // WebSockets preserve order: the ping proves every preceding pick was processed.
    await host.waitFor((m) => m.type === 'relay' && (m.data as { type: string }).type === 'ping');
    const received = host.inbox.flatMap((m) => (m.type === 'relay' && m.from === 1 ? [m.data] : []));
    const missing = expected.filter(
      (data) => !received.some((value) => JSON.stringify(value) === JSON.stringify(data)),
    );
    assert.equal(
      missing.length,
      0,
      `Live relay rejects guest champions: ${missing.map((m) => `${m.champion} (${m.type})`).join(', ')}. Deploy the current Worker with npm run signal:deploy before publishing the frontend.`,
    );
  } finally {
    for (const socket of sockets.reverse()) socket.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const service = process.env.VITE_SIGNAL_URL;
  assert(service, 'Set VITE_SIGNAL_URL to the deployed Cloudflare Worker URL before publishing.');
  await checkRelay(service, process.env.SIGNAL_ORIGIN ?? 'https://maxlsb.github.io');
  console.log(`Relay accepts guest join and selection for: ${CHAMPIONS.join(', ')}`);
}
