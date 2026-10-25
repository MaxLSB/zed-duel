import { SINGED_PASSIVE, SINGED_SPELLS as S } from '../shared/singed-balance';

const cd = (seconds: number) => `${Number(seconds.toFixed(2))}s`;
export const singedDescriptions: Record<string, string> = {
  passive: `Passing an opponent grants 25% movement speed for ${SINGED_PASSIVE.duration}s. ${cd(SINGED_PASSIVE.cooldown)} per-target cooldown.`,
  q: `Toggle poison behind you. Clouds linger ${S.q.cloudDuration}s and poison enemies for ${S.q.duration}s, dealing ${S.q.damage} + ${S.q.ratio * 100}% AP magic damage every ${S.q.interval}s. ${cd(S.q.cooldown)} toggle cooldown. No mana cost.`,
  w: `Throw adhesive toward your cursor. After ${S.w.delay}s, it slows enemies by 70% and grounds them for ${S.w.duration}s while inside. Grounding prevents Flash and Zed's dashes and swaps. ${cd(S.w.cooldown)} cooldown.`,
  e: `Hover your opponent to approach and fling them ${S.e.distance} units behind you. Deals ${S.e.damage} + 8% maximum HP + 55% AP magic damage. Landing in your adhesive roots for ${S.e.root}s. ${cd(S.e.cooldown)} cooldown.`,
  r: `Gain ${S.r.bonus} AP, armor, magic resistance, movement speed and health regeneration per 5s for ${S.r.duration}s. Poison reduces healing by 40%. ${cd(S.r.cooldown)} cooldown; recasting refreshes the duration without stacking.`,
  d: `Blink up to ${S.d.range} units toward your cursor. ${cd(S.d.cooldown)} cooldown.`,
};
