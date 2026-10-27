import { ARENA, COOLDOWN_DIVISOR, SPELLS } from './balance';

// Level 18, maximum ranks, no items. Sources and duel adaptations: docs/ezreal.md.
export const EZREAL_STATS = {
  hp: 2334,
  hpRegen: 3.01,
  ad: 123.75,
  armor: 95.4,
  mr: 51.7,
  speed: 325,
  attackSpeed: 0.625 * (1 + 0.025 * 17),
  attackRange: 550,
  radius: 65,
  windup: 0.18839,
} as const;

export const EZREAL_PASSIVE = {
  name: 'Rising Spell Force',
  stacks: 5,
  duration: 6,
  attackSpeed: 0.1,
  ratio: 0.625,
} as const;

export const EZREAL_SPELLS = {
  q: {
    name: 'Mystic Shot',
    cooldown: 4.5 / COOLDOWN_DIVISOR,
    range: 1200,
    speed: 2000,
    width: 120,
    cast: 0.25,
    damage: 120 + 1.3 * EZREAL_STATS.ad,
    refund: 1.5 / COOLDOWN_DIVISOR,
  },
  w: {
    name: 'Essence Flux',
    cooldown: 8 / COOLDOWN_DIVISOR,
    range: 1200,
    speed: 1700,
    width: 160,
    cast: 0.25,
    damage: 300,
    duration: 4,
  },
  e: {
    name: 'Arcane Shift',
    cooldown: 14 / COOLDOWN_DIVISOR,
    range: 475,
    boltRange: 750,
    speed: 2000,
    width: 40,
    cast: 0.25,
    damage: 280,
  },
  r: {
    name: 'Trueshot Barrage',
    cooldown: 10,
    range: Math.hypot(ARENA.width, ARENA.height),
    speed: 2000,
    width: 320,
    cast: 1,
    damage: 750,
  },
  d: SPELLS.d,
} as const;
