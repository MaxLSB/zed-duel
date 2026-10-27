import { EZREAL_PASSIVE, EZREAL_SPELLS, EZREAL_STATS } from './ezreal-balance';
import { YASUO_SPELLS, YASUO_STATS } from './yasuo-balance';
import { SPELLS, STATS } from './balance';
import { SINGED_SPELLS, SINGED_STATS } from './singed-balance';
import { AHRI_SPELLS, AHRI_STATS } from './ahri-balance';
import { LEBLANC_SPELLS, LEBLANC_STATS } from './leblanc-balance';
import type { ChampionId, PlayerState } from './types';

export const CHAMPIONS = ['zed', 'singed', 'ahri', 'leblanc', 'yasuo', 'ezreal'] as const;
export const championName = (id: ChampionId) =>
  ({ zed: 'Zed', singed: 'Singed', ahri: 'Ahri', leblanc: 'LeBlanc', yasuo: 'Yasuo', ezreal: 'Ezreal' })[id];
export const championStats = (id: ChampionId) =>
  ({
    zed: STATS,
    singed: SINGED_STATS,
    ahri: AHRI_STATS,
    leblanc: LEBLANC_STATS,
    yasuo: YASUO_STATS,
    ezreal: EZREAL_STATS,
  })[id];
export const championSpells = (id: ChampionId) =>
  ({
    zed: SPELLS,
    singed: SINGED_SPELLS,
    ahri: AHRI_SPELLS,
    leblanc: LEBLANC_SPELLS,
    yasuo: YASUO_SPELLS,
    ezreal: EZREAL_SPELLS,
  })[id];
export const potionBonus = (p: PlayerState, now: number) =>
  p.singed && p.singed.insanityUntil > now ? SINGED_SPELLS.r.bonus : 0;

export const attackSpeed = (p: PlayerState, now: number) =>
  championStats(p.champion).attackSpeed +
  (p.ezreal && p.ezreal.stacksUntil > now
    ? EZREAL_PASSIVE.ratio * EZREAL_PASSIVE.attackSpeed * p.ezreal.stacks
    : 0);
