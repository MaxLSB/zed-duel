import { COOLDOWN_DIVISOR, SPELLS } from './balance';

// Fixed level-18, maximum-rank, no-item duel baseline. See docs/yasuo.md.
const bonusAttackSpeed = 0.035 * 17;
export const YASUO_STATS = {
  hp: 2460,
  hpRegen: 3.4,
  ad: 102.5,
  armor: 110.2,
  mr: 66.85,
  speed: 345,
  attackSpeed: 0.697 * (1 + bonusAttackSpeed),
  attackRange: 175,
  radius: 65,
  windup: 0.22,
} as const;
export const YASUO_PASSIVE = {
  name: 'Way of the Wanderer',
  maxFlow: 100,
  distance: 4000,
  shield: 475,
  duration: 1,
} as const;
export const YASUO_SPELLS = {
  q: {
    name: 'Steel Tempest',
    cooldown: 4 / (1 + bonusAttackSpeed) / COOLDOWN_DIVISOR,
    range: 450,
    width: 80,
    damage: 120 + 1.05 * YASUO_STATS.ad,
    cast: 0.35 / (1 + bonusAttackSpeed),
    duration: 6,
    tornadoRange: 1150,
    tornadoWidth: 180,
    speed: 1200,
    airborne: 0.9,
    radius: 215,
  },
  w: { name: 'Wind Wall', cooldown: 17 / COOLDOWN_DIVISOR, range: 100, width: 600, duration: 4 },
  e: {
    name: 'Sweeping Blade',
    cooldown: 0.1,
    qBuffer: 0.5,
    range: 475,
    speed: 750 + 0.6 * YASUO_STATS.speed,
    damage: 130,
    lockout: 6,
    duration: 5,
    stackBonus: 0.25,
    maxStacks: 4,
  },
  r: { name: 'Last Breath', cooldown: 10, range: 1400, damage: 500, duration: 1 },
  d: SPELLS.d,
} as const;
