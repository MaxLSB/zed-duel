import { isChampion, parseMessage } from './protocol';

export const RELAY_VERSION = 2;
export const MAX_RELAY_LENGTH = 262_144;

export type SignalMessage =
  | { type: 'welcome'; player: 0 | 1; version: number }
  | { type: 'peer' | 'peer-left'; session: string }
  | { type: 'relay'; session: string; from: 0 | 1; data: unknown }
  | { type: 'error'; message: string };

export function validRelayData(player: 0 | 1, value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (player === 0) return ['joined', 'state', 'pong', 'error'].includes(data.type as string);
  if (data.type === 'hello') return isChampion(data.champion);
  if (!['input', 'ready', 'ping', 'select-champion'].includes(data.type as string)) return false;
  const raw = JSON.stringify(data);
  return raw.length <= 2048 && parseMessage(raw) !== null;
}
