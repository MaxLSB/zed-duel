import { COOLDOWN_DIVISOR, SPELLS } from './balance';

// Level 18, max ranks, no items. Sources and prototype overrides: docs/singed.md.
export const SINGED_STATS = {
  hp: 2282,
  hpRegen: 3.77,
  ad: 120.8,
  armor: 105.4,
  mr: 66.85,
  speed: 355,
  attackSpeed: 0.7 + 0.625 * 0.019 * 17,
  attackRange: 125,
  radius: 65,
  windup: 0.2,
} as const;

export const SINGED_PASSIVE = {
  name: 'Noxious Slipstream',
  range: 325,
  speed: 0.25,
  duration: 2,
  cooldown: 10,
} as const;
export const SINGED_SPELLS = {
  q: {
    name: 'Poison Trail',
    cooldown: 1 / COOLDOWN_DIVISOR,
    range: 180,
    cloudDuration: 3.25,
    duration: 2,
    interval: 0.25,
    damage: 15,
    ratio: 0.10625,
  },
  w: {
    name: 'Mega Adhesive',
    cooldown: 13 / COOLDOWN_DIVISOR,
    range: 1000,
    radius: 265,
    cast: 0.25,
    delay: 0.375,
    duration: 3,
    slow: 0.7,
  },
  e: {
    name: 'Fling',
    cooldown: 8 / COOLDOWN_DIVISOR,
    range: 125,
    cast: 0.25,
    distance: 550,
    flight: 0.693,
    damage: 90,
    healthRatio: 0.08,
    ratio: 0.55,
    root: 2,
  },
  r: {
    name: 'Insanity Potion',
    cooldown: 10,
    range: 0,
    duration: 10,
    bonus: 85,
    grievous: 0.4,
    grievousDuration: 1,
  },
  d: SPELLS.d,
} as const;
