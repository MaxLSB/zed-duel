import type { SignalRoom } from './room';
import type { TurnEnv } from './turn';
export { SignalRoom } from './room';

interface Env extends TurnEnv {
  ROOMS: DurableObjectNamespace<SignalRoom>;
  ALLOWED_ORIGIN: string;
  REQUEST_LIMITER: RateLimit;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: true });
    if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN)
      return new Response('Origin not allowed', { status: 403 });
    const headers = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const limit = await env.REQUEST_LIMITER.limit({
      key: request.headers.get('CF-Connecting-IP') ?? 'local',
    });
    if (!limit.success)
      return Response.json(
        { error: 'Too many connection attempts. Wait a minute and retry.' },
        { status: 429, headers },
      );
    if (url.pathname === '/rooms' && request.method === 'POST') {
      if (env.LOCAL_TEST !== 'true' && (!env.TURN_KEY_ID || !env.TURN_API_TOKEN))
        return Response.json({ error: 'The relay service is not configured yet.' }, { status: 503, headers });
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = [...crypto.getRandomValues(new Uint8Array(3))]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase();
        const room = env.ROOMS.get(env.ROOMS.idFromName(code));
        const response = await room.fetch(new Request('https://room/create', { method: 'POST' }));
        if (response.ok)
          return Response.json({ code, ...((await response.json()) as { token: string }) }, { headers });
      }
      return Response.json({ error: 'Could not create a room. Try again.' }, { status: 503, headers });
    }
    const match = /^\/rooms\/([A-Z0-9]{6})\/socket$/.exec(url.pathname);
    if (match && request.method === 'GET')
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
    return new Response('Not found', { status: 404, headers });
  },
} satisfies ExportedHandler<Env>;
