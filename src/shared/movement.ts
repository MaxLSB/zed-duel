import { championStats, potionBonus } from './champions';
import { bounded, distance, towards } from './geometry';
import { SINGED_PASSIVE, SINGED_SPELLS } from './singed-balance';
import type { GameState, PlayerId, PlayerState } from './types';

export function grounded(p: PlayerState, state: GameState, owner?: PlayerId) {
  return state.zones.some(
    (z) =>
      z.kind === 'adhesive' &&
      z.owner !== p.id &&
      (owner === undefined || z.owner === owner) &&
      z.created <= state.time &&
      z.expires > state.time &&
      distance(z.pos, p.pos) <= SINGED_SPELLS.w.radius + championStats(p.champion).radius,
  );
}

export function movePlayer(p: PlayerState, state: GameState, dt: number) {
  const now = state.time;
  if (
    !p.destination ||
    p.hp <= 0 ||
    p.airborne ||
    p.ultimate ||
    p.untargetableUntil > now ||
    p.castUntil > now ||
    p.windupUntil > now ||
    p.rootUntil > now
  )
    return;
  const target = p.destination;
  p.facing = Math.atan2(target.y - p.pos.y, target.x - p.pos.x);
  const slow = Math.max(p.slowUntil > now ? p.slow : 0, grounded(p, state) ? SINGED_SPELLS.w.slow : 0);
  const slipstream = p.singed && p.singed.slipstreamUntil > now ? 1 + SINGED_PASSIVE.speed : 1;
  const speed = (championStats(p.champion).speed + potionBonus(p, now)) * slipstream * (1 - slow);
  p.pos = bounded(towards(p.pos, target, speed * dt));
  if (distance(p.pos, target) < 1) p.destination = null;
}
