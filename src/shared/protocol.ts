import { SPELL_KEYS } from './balance';
import type { ChampionId, ClientMessage, Input, Vec } from './types';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
export const isChampion = (value: unknown): value is ChampionId =>
  value === 'zed' ||
  value === 'singed' ||
  value === 'ahri' ||
  value === 'leblanc' ||
  value === 'yasuo' ||
  value === 'ezreal';
const point = (value: unknown): value is Vec =>
  object(value) &&
  typeof value.x === 'number' &&
  Number.isFinite(value.x) &&
  Math.abs(value.x) < 100_000 &&
  typeof value.y === 'number' &&
  Number.isFinite(value.y) &&
  Math.abs(value.y) < 100_000;

function input(value: unknown): value is Input {
  if (!object(value)) return false;
  if (value.action === 'attack' || value.action === 'stop') return true;
  if (value.action === 'move' || value.action === 'attack-move') return point(value.point);
  return (
    value.action === 'cast' &&
    SPELL_KEYS.includes(value.spell as never) &&
    point(value.point) &&
    (value.target === undefined || value.target === 0 || value.target === 1)
  );
}

export function parseMessage(raw: string): ClientMessage | null {
  try {
    const message: unknown = JSON.parse(raw);
    if (!object(message)) return null;
    if (message.type === 'select-champion' && isChampion(message.champion)) return message as ClientMessage;
    if (
      ['create', 'practice'].includes(message.type as string) &&
      (message.champion === undefined || isChampion(message.champion))
    )
      return message as ClientMessage;
    if (['reset-practice', 'ready', 'leave'].includes(message.type as string))
      return message as ClientMessage;
    if (
      message.type === 'join' &&
      typeof message.code === 'string' &&
      /^[A-Z0-9]{6}$/.test(message.code) &&
      (message.champion === undefined || isChampion(message.champion))
    )
      return message as ClientMessage;
    if (message.type === 'ping' && typeof message.sent === 'number' && Number.isFinite(message.sent))
      return message as ClientMessage;
    if (
      message.type === 'input' &&
      Number.isSafeInteger(message.seq) &&
      (message.seq as number) >= 0 &&
      input(message.input)
    )
      return message as ClientMessage;
    return null;
  } catch {
    return null;
  }
}
