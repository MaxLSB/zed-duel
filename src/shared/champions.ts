import { SPELLS, STATS } from './balance';
import { SINGED_SPELLS, SINGED_STATS } from './singed-balance';
import { AHRI_SPELLS, AHRI_STATS } from './ahri-balance';
import { LEBLANC_SPELLS, LEBLANC_STATS } from './leblanc-balance';
import type { ChampionId, PlayerState } from './types';

export const CHAMPIONS = ['zed', 'singed', 'ahri', 'leblanc'] as const;
export const championName = (id: ChampionId) =>
  ({ zed: 'Zed', singed: 'Singed', ahri: 'Ahri', leblanc: 'LeBlanc' })[id];
export const championStats = (id: ChampionId) =>
  ({ zed: STATS, singed: SINGED_STATS, ahri: AHRI_STATS, leblanc: LEBLANC_STATS })[id];
export const championSpells = (id: ChampionId) =>
  ({ zed: SPELLS, singed: SINGED_SPELLS, ahri: AHRI_SPELLS, leblanc: LEBLANC_SPELLS })[id];
export const potionBonus = (p: PlayerState, now: number) =>
  p.singed && p.singed.insanityUntil > now ? SINGED_SPELLS.r.bonus : 0;
