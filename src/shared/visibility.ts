import type { PlayerState } from './types';

// Stealth prevents acquiring a target, but does not grant skillshot / area immunity.
export const visible = (p: PlayerState, now: number) => !p.leblanc || p.leblanc.invisibleUntil <= now;
