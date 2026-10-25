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
  if (game.players.every((p) => p.champion === 'singed')) rows.splice(0, 3);
  const valueFor = (name: string, value: (stats: MatchStats) => string | number, id: PlayerId) =>
    game.players[id].champion === 'singed' && (name.startsWith('Shurikens') || name === 'Accuracy')
      ? '—'
      : value(game.players[id].stats);
  return `<p class="match-duration">Duration <strong>${duration(game.time)}</strong></p>
    <table class="match-stats" aria-label="Match statistics">
      <thead><tr><th scope="col">Match stats</th><th scope="col">You</th><th scope="col">${practice ? 'Dummy' : 'Opponent'}</th></tr></thead>
      <tbody>${rows.map(([name, value]) => `<tr><th scope="row">${name}</th><td>${valueFor(name, value, me)}</td><td>${valueFor(name, value, (1 - me) as PlayerId)}</td></tr>`).join('')}</tbody>
    </table>`;
}
