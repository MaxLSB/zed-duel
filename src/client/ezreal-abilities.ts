import { EZREAL_PASSIVE as P, EZREAL_SPELLS as S } from '../shared/ezreal-balance';

const cd = (seconds: number) => `${Number(seconds.toFixed(2))}s`;
export const ezrealDescriptions: Record<string, string> = {
  passive: `Damaging ability hits grant 10% bonus attack speed for ${P.duration}s, stacking up to ${P.stacks} times. Hits refresh all stacks. Essence Flux grants its stack when detonated; a spell that detonates it grants two. Basic attacks alone grant no stacks.`,
  q: `Fire a bolt toward your cursor for ${S.q.damage} physical damage. A hit reduces Q/W/E/R cooldowns by ${S.q.refund}s, including this spell. Flash is unaffected. ${cd(S.q.cooldown)} cooldown.`,
  w: `Fire an orb that marks the first enemy hit for ${S.w.duration}s. Your next attack or damaging ability detonates it for ${S.w.damage} magic damage. Applying the mark deals no damage. ${cd(S.w.cooldown)} cooldown.`,
  e: `After ${S.e.cast}s, blink up to ${S.e.range} units toward your cursor and fire a homing bolt at an enemy within ${S.e.boltRange} units for ${S.e.damage} magic damage. Roots and grounding prevent the blink. ${cd(S.e.cooldown)} cooldown.`,
  r: `Wind up for ${S.r.cast}s, then fire a wide arc across the arena for ${S.r.damage} magic damage. You can Flash during the windup; the arc keeps its original launch point and aim. Hits each enemy once and continues through them. Crowd control interrupts the windup. ${cd(S.r.cooldown)} cooldown.`,
  d: `Blink up to ${S.d.range} units toward your cursor. ${cd(S.d.cooldown)} cooldown.`,
};
