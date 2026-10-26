import { HostedMatch } from '../../shared/hosted-match';
import { STEP } from '../../shared/balance';
import type { ChampionId, PlayerId } from '../../shared/types';

export type HostCommand =
  | { type: 'start'; mode: 'duel' | 'practice'; code: string; champion?: ChampionId }
  | { type: 'join'; champion?: ChampionId }
  | { type: 'leave' }
  | { type: 'message'; player: PlayerId; message: unknown };

let match: HostedMatch | null = null;
let previous = performance.now(),
  accumulator = 0,
  ticks = 0;
self.onmessage = ({ data }: MessageEvent<HostCommand>) => {
  if (data.type === 'start') {
    match = new HostedMatch(
      data.mode,
      data.code,
      (player, message) => self.postMessage({ player, message }),
      data.champion,
    );
    previous = performance.now();
    accumulator = 0;
  }
  if (data.type === 'join') match?.join(data.champion);
  if (data.type === 'leave') match?.leave();
  if (data.type === 'message') match?.handle(data.player, data.message);
};
setInterval(() => {
  const now = performance.now();
  accumulator += Math.min((now - previous) / 1000, 0.25);
  previous = now;
  while (accumulator >= STEP) {
    match?.step();
    accumulator -= STEP;
    if (++ticks % 2 === 0) match?.broadcast();
  }
}, 8);
