import { championName } from '../shared/champions';
import type { GameState, PlayerId, PlayerState } from '../shared/types';

export function duration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

interface Metric {
  label: string;
  value: string;
  hint?: string;
}
const numeric = (n?: number): n is number => typeof n === 'number' && Number.isFinite(n);
const count = (n?: number) => (numeric(n) ? Math.round(n).toLocaleString('en-US') : '—');
const seconds = (n?: number) => (numeric(n) ? `${n.toFixed(1)}s` : '—');
const accuracy = (hit?: number, attempts?: number) =>
  !numeric(hit) || !numeric(attempts) || attempts <= 0 ? '—' : `${Math.round((hit / attempts) * 100)}%`;
const hitMiss = (hit?: number, attempts?: number) =>
  !numeric(hit) || !numeric(attempts) ? '—' : `${count(hit)} / ${count(Math.max(0, attempts - hit))}`;

function championMetrics(p: PlayerState): Metric[] {
  const s = p.stats;
  switch (p.champion) {
    case 'zed':
      return [
        { label: 'Shurikens hit', value: count(s.shurikensHit) },
        { label: 'Shurikens missed', value: count(s.shurikensThrown - s.shurikensHit) },
        { label: 'Accuracy', value: accuracy(s.shurikensHit, s.shurikensThrown) },
      ];
    case 'ahri': {
      const a = s.ahri;
      return [
        {
          label: 'Orb hits · out / back',
          value: a ? `${count(a.orbOutHits)} / ${count(a.orbReturnHits)}` : '—',
        },
        {
          label: 'Orb pass accuracy',
          value: accuracy(a && a.orbOutHits + a.orbReturnHits, a && a.orbsThrown * 2),
          hint: 'Each launched orb has two possible hits: outbound and return.',
        },
        { label: 'Charms hit / missed', value: hitMiss(a?.charmsHit, a?.charmsThrown) },
        { label: 'Charm accuracy', value: accuracy(a?.charmsHit, a?.charmsThrown) },
        { label: 'Fox-Fire hits', value: count(a?.fireHits) },
        {
          label: 'Spirit Rush hits',
          value: count(a?.rushHits),
          hint: 'Bolts that hit the opponent, not dashes used.',
        },
        {
          label: 'Essence healing',
          value: count(a?.healing),
          hint: 'HP actually restored by the passive, after healing reduction and the health cap.',
        },
      ];
    }
    case 'singed': {
      const s = p.stats.singed;
      return [
        {
          label: 'Poison damage',
          value: count(s?.poisonDamage),
          hint: 'Actual HP removed by Poison Trail, after defenses and excluding overkill.',
        },
        {
          label: 'Enemy poisoned',
          value: seconds(s?.poisonSeconds),
          hint: 'Time the opponent was poisoned, including lingering poison. Overlapping clouds count once.',
        },
        { label: 'Flings landed', value: count(s?.flingsHit) },
        {
          label: 'Adhesive roots',
          value: count(s?.adhesiveRoots),
          hint: 'Flings that landed the opponent in your Mega Adhesive and applied a root.',
        },
        {
          label: 'Insanity Potion uptime',
          value: seconds(s?.potionSeconds),
          hint: 'Time the potion was active during this round.',
        },
      ];
    }
    case 'leblanc': {
      const l = s.leblanc;
      return [
        {
          label: 'Sigils detonated',
          value: count(l?.sigilsDetonated),
          hint: 'Normal and mimicked marks triggered by another ability.',
        },
        {
          label: 'Distortion hits',
          value: count(l?.distortionHits),
          hint: 'Normal and mimicked dash impacts that hit the opponent. Returns do not deal damage.',
        },
        {
          label: 'Chains hit / missed',
          value: hitMiss(l?.chainsHit, l?.chainsThrown),
          hint: 'Normal and mimicked chain projectiles.',
        },
        { label: 'Chain accuracy', value: accuracy(l?.chainsHit, l?.chainsThrown) },
        { label: 'Chain roots', value: count(l?.chainRoots), hint: 'Completed tethers that applied a root.' },
        {
          label: 'Mimic casts hit',
          value: count(l?.mimicHits),
          hint: 'Mimicked spells that connected; each cast counts once, excluding delayed damage and returns.',
        },
        {
          label: 'Returns used',
          value: count(l?.returnsUsed),
          hint: 'Successful returns from either Distortion origin.',
        },
      ];
    }
  }
}
const label = (row: Metric) => `<th scope="row"${row.hint ? ` title="${row.hint}"` : ''}>${row.label}</th>`;

export function matchSummary(game: GameState, me: PlayerId, practice: boolean) {
  const players = [game.players[me], game.players[1 - me]];
  const names = ['You', practice ? 'Dummy' : 'Opponent'];
  const details = players.map(championMetrics);
  const sameChampion = players[0].champion === players[1].champion;
  const shared = [
    ['Damage dealt', ...players.map((p) => count(p.stats.damageDealt))],
    ['Basic attacks hit', ...players.map((p) => count(p.stats.attacksHit))],
  ];
  const comparison = sameChampion
    ? details[0]
        .map((row, i) => `<tr>${label(row)}<td>${row.value}</td><td>${details[1][i].value}</td></tr>`)
        .join('')
    : '';
  const cards = sameChampion
    ? ''
    : `<div class="champion-recaps">${players
        .map((p, i) => {
          if (practice && i === 1) return '';
          return `<section class="champion-recap player-${p.id}" aria-label="${names[i]} · ${championName(p.champion)} statistics">
      <h3>${names[i]} <span>${championName(p.champion)}</span></h3>
      <table class="match-stats" aria-label="${names[i]} · ${championName(p.champion)} abilities"><tbody>${details[i].map((row) => `<tr>${label(row)}<td>${row.value}</td></tr>`).join('')}</tbody></table>
    </section>`;
        })
        .join('')}</div>`;
  return `<p class="match-duration">Duration <strong>${duration(game.time)}</strong></p>
    <table class="match-stats" aria-label="Match statistics">
      <thead><tr><th scope="col">Match stats</th>${players.map((p, i) => `<th scope="col">${names[i]}<span class="recap-champion">${championName(p.champion)}</span></th>`).join('')}</tr></thead>
      <tbody>${comparison}${shared.map(([name, a, b]) => `<tr><th scope="row">${name}</th><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody>
    </table>${cards}`;
}
