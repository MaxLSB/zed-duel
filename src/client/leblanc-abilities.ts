import { LEBLANC_PASSIVE as P, LEBLANC_SPELLS as S } from '../shared/leblanc-balance';

const cd = (seconds: number) => `${Number(seconds.toFixed(2))}s`;
export const leblancDescriptions: Record<string, string> = {
  passive: `Taking damage below 40% health hides you for ${P.invisible}s and creates an automatic, harmless mirror image for ${P.duration}s. Attacking or casting a new champion spell reveals you; Flash and dash returns preserve stealth. Skillshots and area damage still hit. The image is a visual decoy, not a controllable unit. ${P.cooldown}s cooldown.`,
  q: `Hover the opponent to approach and launch a sigil: ${S.q.damage} magic damage and a ${S.q.duration}s mark. Your next damaging ability detonates it for ${S.q.markDamage} more. Basic attacks do not detonate marks. ${cd(S.q.cooldown)} cooldown.`,
  w: `Dash up to ${S.w.range} units toward your cursor, dealing ${S.w.damage} magic damage around your landing point. Recast within ${S.w.duration}s to return. Roots and grounding block both casts. ${cd(S.w.cooldown)} cooldown; return remains available even when the cooldown ends.`,
  e: `Throw a chain toward your cursor for ${S.e.damage} magic damage. Stay within ${S.e.breakRange} units for ${S.e.delay}s to deal ${S.e.rootDamage} more and root for ${S.e.root}s. Moving too far apart breaks the tether. ${cd(S.e.cooldown)} cooldown.`,
  r: `Repeat your last basic spell: Sigil deals ${S.r.damage} + ${S.r.followup} mark damage; Distortion deals ${S.r.dashDamage}; Chains deal ${S.r.damage} + ${S.r.followup} delayed damage. Mimicked Distortion has its own return point. Cast a basic spell first. ${S.r.cooldown}s cooldown.`,
  d: `Blink up to ${S.d.range} units toward your cursor. ${S.d.cooldown}s cooldown.`,
};
