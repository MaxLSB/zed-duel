import { AHRI_PASSIVE, AHRI_SPELLS as S } from '../shared/ahri-balance';

const cd = (seconds: number) => `${Number(seconds.toFixed(2))}s`;
export const ahriDescriptions: Record<string, string> = {
  passive: `Heal ${AHRI_PASSIVE.heal} HP on a champion kill, reduced by healing reduction. The duel has no minions to collect essence from.`,
  q: `Send an orb toward your cursor for ${S.q.damage} magic damage, then ${S.q.damage} true damage as it returns to you. One hit per pass. ${cd(S.q.cooldown)} cooldown.`,
  w: `Conjure three homing flames and gain 40% movement speed decaying over 2s. The first flame deals ${S.w.damage} magic damage; each additional flame deals ${S.w.damage * S.w.repeat}. Flames last ${S.w.duration}s. ${cd(S.w.cooldown)} cooldown.`,
  e: `Fire a kiss toward your cursor for ${S.e.damage} magic damage. The first enemy hit walks toward you for ${S.e.duration}s at 65% reduced speed, unable to attack or cast. Interrupts dashes. ${cd(S.e.cooldown)} cooldown.`,
  r: `Dash up to ${S.r.range} units toward your cursor and fire a ${S.r.damage} magic damage bolt at a nearby enemy. Three casts within ${S.r.duration}s, ${S.r.recast}s apart. ${cd(S.r.cooldown)} cooldown after the last cast or expiry. Roots and grounding prevent dashes.`,
  d: `Blink up to ${S.d.range} units toward your cursor. ${cd(S.d.cooldown)} cooldown.`,
};
