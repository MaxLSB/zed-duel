import type { ChampionId, GameState } from '../shared/types';

export class ChampionSelection {
  pending: ChampionId | null = null;

  choose(champion: ChampionId) {
    this.pending = champion;
  }

  reconcile(actual: ChampionId, phase: GameState['phase']): ChampionId {
    if (actual === this.pending || (phase !== 'waiting' && phase !== 'finished')) this.pending = null;
    return this.pending ?? actual;
  }

  clear() {
    this.pending = null;
  }
}
