import type { GameState, MatchStats, PlayerId } from '../shared/types';

export function duration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function matchSummary(game: GameState, me: PlayerId, practice: boolean) {
  const rows: [string, (stats: MatchStats) => string | number][] = [
    ['Shurikens hit', (s) => s.shurikensHit],
    ['Shurikens missed', (s) => s.shurikensThrown - s.shurikensHit],
    [
      'Accuracy',
      (s) => (s.shurikensThrown ? `${Math.round((s.shurikensHit / s.shurikensThrown) * 100)}%` : '—'),
    ],
    ['Damage dealt', (s) => Math.round(s.damageDealt).toLocaleString('en-US')],
    ['Basic attacks hit', (s) => s.attacksHit],
  ];
  return `<p class="match-duration">Duration <strong>${duration(game.time)}</strong></p>
    <table class="match-stats" aria-label="Match statistics">
      <thead><tr><th scope="col">Match stats</th><th scope="col">You</th><th scope="col">${practice ? 'Dummy' : 'Opponent'}</th></tr></thead>
      <tbody>${rows.map(([name, value]) => `<tr><th scope="row">${name}</th><td>${value(game.players[me].stats)}</td><td>${value(game.players[1 - me].stats)}</td></tr>`).join('')}</tbody>
    </table>`;
}
