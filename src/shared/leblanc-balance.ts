import { COOLDOWN_DIVISOR, SPELLS } from './balance';

// Fixed level-18 prototype baseline and duel overrides; see docs/leblanc.md.
export const LEBLANC_STATS = {
  hp: 2434,
  hpRegen: 3.37,
  ad: 114.5,
  armor: 93.4,
  mr: 52.1,
  speed: 340,
  attackSpeed: 0.658 + 0.625 * 0.015 * 17,
  attackRange: 525,
  radius: 65,
  windup: 0.2,
} as const;
export const LEBLANC_PASSIVE = {
  name: 'Mirror Image',
  threshold: 0.4,
  cooldown: 10,
  invisible: 1,
  duration: 8,
} as const;
export const LEBLANC_SPELLS = {
  q: {
    name: 'Sigil of Malice',
    cooldown: 6 / COOLDOWN_DIVISOR,
    range: 700,
    damage: 165,
    markDamage: 165,
    duration: 3.5,
    cast: 0.25,
    speed: 2000,
  },
  w: {
    name: 'Distortion',
    cooldown: 10 / COOLDOWN_DIVISOR,
    range: 600,
    damage: 235,
    radius: 240,
    speed: 1450,
    duration: 4,
    recast: 0.2,
  },
  e: {
    name: 'Ethereal Chains',
    cooldown: 11 / COOLDOWN_DIVISOR,
    range: 950,
    damage: 130,
    rootDamage: 260,
    speed: 1750,
    width: 110,
    cast: 0.25,
    delay: 1.5,
    root: 1.5,
    breakRange: 865,
  },
  r: { name: 'Mimic', cooldown: 10, range: 700, damage: 230, followup: 460, dashDamage: 480 },
  d: SPELLS.d,
} as const;
