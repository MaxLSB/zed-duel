import { YASUO_PASSIVE as P, YASUO_SPELLS as S } from '../shared/yasuo-balance';

const cd = (n: number) => `${Number(n.toFixed(2))}s`;
export const yasuoDescriptions: Record<string, string> = {
  passive: `Walking and Sweeping Blade build Flow. At 100 Flow, incoming damage triggers a ${P.shield} shield for ${P.duration}s. Flash and Last Breath's blink do not build Flow. This no-item duel has no critical strikes.`,
  q: `Thrust toward your cursor for ${Number(S.q.damage.toFixed(1))} physical damage. Two hits within ${S.q.duration}s ready a tornado: your next cast travels ${S.q.tornadoRange} units and knocks up for ${S.q.airborne}s. During Sweeping Blade, slash around your landing point instead. ${cd(S.q.cooldown)} cooldown.`,
  w: `Raise a ${S.w.width}-unit wall in front of you for ${S.w.duration}s. Destroys enemy projectiles, including returning orbs, tornadoes and ranged attacks. Melee attacks and area damage pass through. ${cd(S.w.cooldown)} cooldown.`,
  e: `Hover an opponent within ${S.e.range} units to dash through them for ${S.e.damage} magic damage. The same target cannot be dashed through again for ${S.e.lockout}s. Hit stacks increase dash damage by 25% for ${S.e.duration}s, up to four stacks. Cast Steel Tempest during the dash for a circular slash. Flash during the dash to finish the slash at your Flash destination. Roots and grounding block the dash.`,
  r: `Automatically select the closest airborne opponent within ${S.r.range} units and blink to them and suspend them for ${S.r.duration}s, then deal ${S.r.damage} physical damage. Refills Flow and clears Steel Tempest stacks. You cannot act during the finisher. ${S.r.cooldown}s cooldown.`,
  d: `Blink up to ${S.d.range} units toward your cursor. ${S.d.cooldown}s cooldown.`,
};
