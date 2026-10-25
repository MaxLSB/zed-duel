export const COOLDOWN_DIVISOR = 3;
export const ARENA = { width: 2400, height: 1400, margin: 65 } as const;
export const STEP = 1 / 60;
export const STATS = {
  hp: 2337,
  hpRegen: 3.61,
  ad: 120.8,
  armor: 111.9,
  mr: 63.85,
  speed: 345,
  attackSpeed: 1.016211,
  attackRange: 125,
  radius: 65,
  windup: 0.19759,
} as const;

export const SPELLS = {
  q: {
    name: 'Razor Shuriken',
    cooldown: 6 / COOLDOWN_DIVISOR,
    range: 925,
    damage: 240,
    speed: 1700,
    width: 120,
    cast: 0.22,
  },
  w: {
    name: 'Living Shadow',
    cooldown: 16 / COOLDOWN_DIVISOR,
    range: 650,
    duration: 5.25,
    speed: 2500,
    swapRange: 2000,
  },
  e: {
    name: 'Shadow Slash',
    cooldown: 3 / COOLDOWN_DIVISOR,
    range: 315,
    shadowRange: 290,
    damage: 160,
    slow: 0.4,
    duration: 1.5,
    reduction: 3,
  },
  r: {
    name: 'Death Mark',
    cooldown: 10,
    range: 625,
    delay: 0.6,
    dash: 0.35,
    duration: 3,
    ratio: 0.55,
    shadowDuration: 9,
    swapWindow: 7.5,
    cancelCooldown: 0.5 / COOLDOWN_DIVISOR,
  },
  d: { name: 'Flash', cooldown: 10, range: 400 },
} as const;

export type SpellKey = keyof typeof SPELLS;
export const SPELL_KEYS = Object.keys(SPELLS) as SpellKey[];
export const PASSIVE = { threshold: 0.5, ratio: 0.1, cooldown: 10 } as const;
