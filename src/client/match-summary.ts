import type { GameState, PlayerId } from '../shared/types';

export function duration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

const count = (n?: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—';

export function matchSummary(game: GameState, me: PlayerId, practice: boolean) {
  const players = [game.players[me], game.players[1 - me]];
  const names = ['You', practice ? 'Dummy' : 'Opponent'];
  const rows = [
    ['Damage dealt', ...players.map((p) => count(p.stats.damageDealt))],
    // All damage in a duel comes from the other player; use actual HP removed.
    ['Damage taken', ...players.map((_, i) => count(players[1 - i].stats.damageDealt))],
    ['Basic attacks hit', ...players.map((p) => count(p.stats.attacksHit))],
    ['Health remaining', ...players.map((p) => count(p.hp))],
  ];
  return `<p class="match-duration">Duration <strong>${duration(game.time)}</strong></p>
    <table class="match-stats" aria-label="Match statistics">
      <thead><tr><th scope="col">Match stats</th>${names.map((name) => `<th scope="col">${name}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([name, a, b]) => `<tr><th scope="row">${name}</th><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody>
    </table>`;
}
