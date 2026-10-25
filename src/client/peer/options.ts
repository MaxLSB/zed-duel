import type { PeerOptions } from 'peerjs';

export function peerOptions(): PeerOptions {
  const options: PeerOptions = { debug: 0 };
  const signaling = import.meta.env.VITE_PEER_SERVER_URL;
  if (signaling) {
    const url = new URL(signaling);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid connection service URL.');
    options.host = url.hostname;
    options.port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    options.path = url.pathname;
    options.secure = url.protocol === 'https:';
  }
  if (import.meta.env.VITE_ICE_SERVERS)
    options.config = { iceServers: JSON.parse(import.meta.env.VITE_ICE_SERVERS) as RTCIceServer[] };
  return options;
}

export const peerId = (code: string) => `zed-duel-v1-${code}`;
export const roomCode = () =>
  [...crypto.getRandomValues(new Uint8Array(3))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
