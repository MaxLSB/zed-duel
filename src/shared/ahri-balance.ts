import { COOLDOWN_DIVISOR, SPELLS } from './balance';

// Level 18, maximum ranks, no items. Research and duel overrides: docs/ahri.md.
export const AHRI_STATS = {
  hp: 2358,
  hpRegen: 2.54,
  ad: 104,
  armor: 92.4,
  mr: 52.1,
  speed: 330,
  attackSpeed: 0.668 + 0.625 * 0.022 * 17,
  attackRange: 550,
  radius: 65,
  windup: 0.2,
} as const;

export const AHRI_PASSIVE = { name: 'Essence Theft', hits: 3, heal: 60 } as const;
export const AHRI_SPELLS = {
  q: {
    name: 'Orb of Deception',
    cooldown: 7 / COOLDOWN_DIVISOR,
    range: 900,
    damage: 135,
    speed: 1550,
    width: 200,
    cast: 0.25,
  },
  w: {
    name: 'Fox-Fire',
    cooldown: 5 / COOLDOWN_DIVISOR,
    range: 725,
    damage: 120,
    repeat: 0.4,
    speed: 1400,
    duration: 2.5,
    haste: 0.4,
    hasteDuration: 2,
  },
  e: {
    name: 'Charm',
    cooldown: 12 / COOLDOWN_DIVISOR,
    range: 1000,
    damage: 240,
    speed: 1550,
    width: 120,
    cast: 0.25,
    duration: 1.8,
    slow: 0.65,
  },
  r: {
    name: 'Spirit Rush',
    cooldown: 10,
    range: 500,
    boltRange: 600,
    damage: 175,
    speed: 1530,
    boltSpeed: 1400,
    duration: 15,
    recast: 1,
  },
  d: SPELLS.d,
} as const;
