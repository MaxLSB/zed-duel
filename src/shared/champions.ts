import { SPELLS, STATS } from './balance';
import { SINGED_SPELLS, SINGED_STATS } from './singed-balance';
import type { ChampionId, PlayerState } from './types';

export const championName = (id: ChampionId) => (id === 'singed' ? 'Singed' : 'Zed');
export const championStats = (id: ChampionId) => (id === 'singed' ? SINGED_STATS : STATS);
export const championSpells = (id: ChampionId) => (id === 'singed' ? SINGED_SPELLS : SPELLS);
export const potionBonus = (p: PlayerState, now: number) =>
  p.singed && p.singed.insanityUntil > now ? SINGED_SPELLS.r.bonus : 0;
