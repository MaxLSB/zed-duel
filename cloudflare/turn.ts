import type { IceServer } from '../src/shared/signaling';

export interface TurnEnv {
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
  LOCAL_TEST?: string;
}

export async function iceServers(env: TurnEnv): Promise<IceServer[]> {
  if (env.LOCAL_TEST === 'true') return [];
  if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) throw new Error('Relay service is not configured.');
  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 14_400 }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) throw new Error('Relay service is unavailable. Please try again.');
  const result = (await response.json()) as { iceServers?: IceServer[] };
  if (
    !Array.isArray(result.iceServers) ||
    !result.iceServers.some(
      (server) =>
        [server.urls].flat().some((url) => /^turns?:/.test(url)) && server.username && server.credential,
    )
  )
    throw new Error('Relay service returned no usable relay.');
  return result.iceServers
    .map((server) => ({
      ...server,
      urls: [server.urls].flat().filter((url) => !/:53(?:\?|$)/.test(url)),
    }))
    .filter((server) => server.urls.length);
}
