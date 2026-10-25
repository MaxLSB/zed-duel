import assert from 'node:assert/strict';
import { test } from 'node:test';
import { iceServers } from '../cloudflare/turn';

const env = { TURN_KEY_ID: 'test-key', TURN_API_TOKEN: 'test-server-secret' };

test('Cloudflare relay credentials are requested server-side with an expiry and browser-safe ports', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(
      url,
      'https://rtc.live.cloudflare.com/v1/turn/keys/test-key/credentials/generate-ice-servers',
    );
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer test-server-secret');
    assert.deepEqual(JSON.parse(init.body as string), { ttl: 14_400 });
    return Response.json({
      iceServers: [
        {
          urls: ['turn:relay.example:53', 'turns:relay.example:443?transport=tcp'],
          username: 'temporary-user',
          credential: 'temporary-password',
        },
      ],
    });
  });
  assert.deepEqual(await iceServers(env), [
    {
      urls: ['turns:relay.example:443?transport=tcp'],
      username: 'temporary-user',
      credential: 'temporary-password',
    },
  ]);
});

test('missing credentials and unavailable relays fail instead of silently promising remote connectivity', async (t) => {
  await assert.rejects(iceServers({}), /not configured/);
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 403 }));
  await assert.rejects(iceServers(env), /unavailable/);
  fetch.mock.mockImplementation(async () =>
    Response.json({ iceServers: [{ urls: 'stun:stun.example:3478' }] }),
  );
  await assert.rejects(iceServers(env), /no usable relay/);
});

test('local tests deliberately bypass the external relay without requesting credentials', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Must stay offline');
  });
  assert.deepEqual(await iceServers({ LOCAL_TEST: 'true' }), []);
  assert.equal(fetch.mock.callCount(), 0);
});
