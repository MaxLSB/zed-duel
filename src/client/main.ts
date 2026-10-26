import './style.css';
import { CHAMPIONS, championName, championStats, championSpells } from '../shared/champions';
import { isChampion } from '../shared/protocol';
import { ahriDescriptions } from './ahri-abilities';
import { AHRI_PASSIVE } from '../shared/ahri-balance';
import { singedDescriptions } from './singed-abilities';
import { SINGED_PASSIVE } from '../shared/singed-balance';
import { PASSIVE, SPELL_KEYS, SPELLS } from '../shared/balance';
import { bindingLabel, Controls, DEFAULT_BINDINGS, isBinding, normalizeBinding } from './input';
import type { Bindings } from './input';
import { icon } from './icons';
import { Connection } from './network';
import { Renderer } from './renderer';
import { duration, matchSummary } from './match-summary';
import type { ChampionId, ClientMessage, GameState, PlayerId, RoomState } from '../shared/types';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const basePath = import.meta.env.BASE_URL;
const cooldown = (seconds: number) => `${Number(seconds.toFixed(2))}s`;
const descriptions: Record<string, string> = {
  passive: `Attacks against enemies below half health deal 10% maximum HP as bonus magic damage. ${cooldown(PASSIVE.cooldown)} per-target cooldown.`,
  q: `Throw a shuriken toward your cursor. Shadows throw too. Each hit deals 240 physical damage. ${cooldown(SPELLS.q.cooldown)}.`,
  w: `Send a shadow toward your cursor. Press again to swap. ${cooldown(SPELLS.w.cooldown)}.`,
  e: `Slash around you and your shadows for 160 physical damage. Shadow hits slow; your hit reduces W cooldown. ${cooldown(SPELLS.e.cooldown)}.`,
  r: `Hover the enemy to mark them. If out of range, move into range first. After 3s: 100% AD + 55% stored damage. Press again to return to your shadow. ${cooldown(SPELLS.r.cooldown)}.`,
  d: `Blink up to 400 units toward your cursor. ${cooldown(SPELLS.d.cooldown)} cooldown.`,
};

$('#app').innerHTML = `
  <main class="shell">
    <header class="masthead">
      <a class="brand" href="${basePath}" aria-label="Zed Duel home">ZED / DUEL</a>
      <div class="header-actions"><span id="connection" class="connection"><i></i>Connecting</span><span id="latency">— ms</span><button id="settings" class="icon-button" aria-label="Settings and controls">${icon('settings')}</button></div>
    </header>
    <section class="match" aria-label="Zed duel">
      <div class="scoreboard">
        ${playerPanel(0)}
        <div class="match-info"><strong id="clock">00:00</strong></div>
        ${playerPanel(1)}
      </div>
      <div class="arena-wrap">
        <canvas id="arena" width="1200" height="700" aria-label="Duel arena. Right-click to move or attack. Use A Z E R and D to cast by default." tabindex="0"></canvas>
        <div class="arena-meta"><span id="room-label"></span><button id="reset-practice" class="text-button" hidden>Reset practice</button><button id="copy-room" class="text-button" hidden>${icon('link')} Copy invite</button><button id="leave" class="text-button" hidden>Leave room</button></div>
        <div id="killcam-bar" class="killcam-bar" hidden><span>Killcam</span><button id="skip-killcam" class="text-button">Skip</button></div>
        <div id="overlay" class="overlay"></div>
      </div>
      <div class="hud">
        <div class="abilities" aria-label="Abilities">
          ${abilitySlot('passive', 'Contempt for the Weak', 'P')}
          <span class="slot-divider"></span>
          ${SPELL_KEYS.map((key) => abilitySlot(key, SPELLS[key].name, DEFAULT_BINDINGS[key].toUpperCase())).join('')}
        </div>
      </div>
    </section>
  </main>
  <div id="toast" role="status" aria-live="polite"></div>
  <dialog id="settings-dialog"><form id="bindings-form"><div class="dialog-heading"><h2>Controls</h2><button type="button" id="close-settings" class="icon-button" aria-label="Close settings">×</button></div><p>Right-click to move or attack. <kbd id="stop-key">S</kbd> to stop. <kbd id="attack-move-key">Q</kbd> then left-click to attack-move. <span id="cast-help">Aim Shuriken, Living Shadow and Flash with your cursor. Hover your opponent for Death Mark.</span></p><div id="binding-fields"></div><p class="dialog-note">Click a binding and press a letter, number or Space. Saved on this browser.</p><div class="dialog-actions"><button type="button" id="reset-bindings" class="secondary">Reset defaults</button><button class="primary" type="submit">Save controls</button></div></form></dialog>
`;

function playerPanel(id: PlayerId) {
  return `<div class="player-panel player-${id}"><div class="player-title"><span id="identity-${id}" class="identity">PLAYER ${id + 1}</span><span id="hp-${id}" class="hp-value">2337 <em>/ 2337</em></span></div><div class="hp-track"><i id="hp-fill-${id}"></i></div><div class="player-sub"><span id="champion-${id}">ZED</span><span id="status-${id}"></span></div></div>`;
}
function abilitySlot(key: string, name: string, binding: string) {
  return `<button class="ability ${key === 'd' ? 'summoner-start' : ''}" data-spell="${key}" type="button" aria-label="${name}" aria-describedby="tip-${key}"><span class="keycap" data-key="${key}">${binding}</span><span class="ability-icon">${icon(key)}</span><span class="cooldown"></span><span class="tooltip" id="tip-${key}" role="tooltip"><strong>${name}</strong>${descriptions[key]}</span></button>`;
}

const connection = new Connection();
const renderer = new Renderer($('#arena'));
const controls = new Controls(
  $('#arena'),
  renderer.toWorld,
  () => connection.room?.game ?? null,
  () => connection.player,
  (input) => {
    if (connection.room?.game.phase !== 'active') return;
    connection.input(input);
    if (input.action === 'move' || input.action === 'attack-move') renderer.click(input.point);
  },
);
renderer.controls = controls;
let overlayContent = '',
  toastTimer = 0;
let invite = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
if (!/^[A-Z0-9]{6}$/.test(invite)) invite = '';
let solo = new URLSearchParams(location.search).has('practice');
let lastConnectionRequest: ClientMessage | null = null;

function connect(message: ClientMessage) {
  lastConnectionRequest = message;
  connection.send(message);
}
const urlChampion = new URLSearchParams(location.search).get('champion');
let selectedChampion: ChampionId = isChampion(urlChampion) ? urlChampion : 'zed';
let displayedChampion: ChampionId | null = null;
function championPicker(champion: ChampionId) {
  return `<div class="champion-picker"><label for="champion-select">Champion</label><select id="champion-select">${CHAMPIONS.map((id) => `<option value="${id}" ${champion === id ? 'selected' : ''}>${championName(id)}</option>`).join('')}</select></div>`;
}
function showChampion(champion: ChampionId) {
  if (displayedChampion === champion) return;
  displayedChampion = champion;
  const spells = championSpells(champion);
  for (const key of ['passive', ...SPELL_KEYS] as const) {
    const name =
      key === 'passive'
        ? champion === 'ahri'
          ? AHRI_PASSIVE.name
          : champion === 'singed'
            ? SINGED_PASSIVE.name
            : 'Contempt for the Weak'
        : spells[key].name;
    const slot = $(`[data-spell="${key}"]`);
    slot.setAttribute('aria-label', name);
    slot.querySelector('.ability-icon')!.innerHTML = icon(
      champion !== 'zed' && key !== 'd' ? `${champion}-${key}` : key,
    );
    $(`#tip-${key}`).innerHTML =
      `<strong>${name}</strong>${{ zed: descriptions, singed: singedDescriptions, ahri: ahriDescriptions }[champion][key]}`;
  }
  $('#cast-help').textContent =
    champion === 'ahri'
      ? 'Aim Orb of Deception, Charm, Spirit Rush and Flash with your cursor. Fox-Fire seeks nearby enemies. Recast Spirit Rush for up to three dashes.'
      : champion === 'singed'
        ? 'Toggle Poison Trail while moving. Aim Mega Adhesive and Flash with your cursor. Hover your opponent for Fling. Insanity Potion buffs you immediately.'
        : 'Aim Shuriken, Living Shadow and Flash with your cursor. Hover your opponent for Death Mark.';
}
$('#overlay').addEventListener('change', (event) => {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement) || select.id !== 'champion-select') return;
  selectedChampion = isChampion(select.value) ? select.value : 'zed';
  if (connection.room) connection.send({ type: 'select-champion', champion: selectedChampion });
  else {
    showChampion(selectedChampion);
    showLobby();
  }
});

function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function overlay(content: string) {
  if (content === overlayContent) return;
  overlayContent = content;
  $('#overlay').innerHTML = content;
  $('#overlay').classList.toggle('hidden', !content);
}
function showLobby() {
  showChampion(selectedChampion);
  $('#killcam-bar').hidden = true;
  $('#reset-practice').hidden = true;
  for (const id of [0, 1]) {
    const champion = id === 0 ? selectedChampion : 'zed';
    const stats = championStats(champion);
    $(`#champion-${id}`).textContent = championName(champion).toUpperCase();
    $(`#hp-${id}`).innerHTML = `${stats.hp} <em>/ ${stats.hp}</em>`;
    $(`#hp-fill-${id}`).style.width = '100%';
    $(`#identity-${id}`).textContent = `PLAYER ${id + 1}`;
    $(`#status-${id}`).textContent = '';
  }
  $('#clock').textContent = '00:00';
  document.querySelectorAll('.ability').forEach((slot) => {
    slot.classList.remove('on-cooldown', 'recast', 'ability-active', 'charge-window', 'passive-counter');
    slot.removeAttribute('aria-pressed');
    slot.querySelector('.cooldown')!.textContent = '';
  });
  overlay(
    `<div class="lobby-card"><h2>Play</h2>${championPicker(selectedChampion)}<button id="create-room" class="primary" ${connection.online ? '' : 'disabled'}>Create a duel ${icon('arrow')}</button><button id="practice" class="practice-button secondary" ${connection.online ? '' : 'disabled'}>Practice solo · stationary dummy</button><div class="or"><span></span>OR JOIN A FRIEND<span></span></div><form id="join-form" class="join-form"><label class="sr-only" for="room-code">Room code</label><input id="room-code" name="code" placeholder="ROOM CODE" maxlength="6" pattern="[A-Za-z0-9]{6}" required autocomplete="off" spellcheck="false" value="${invite}"><button class="secondary" ${connection.online ? '' : 'disabled'}>Join ${icon('arrow')}</button></form></div>`,
  );
}
function renderRoom(room: RoomState) {
  const { game, connected, ready } = room,
    me = connection.player;
  showChampion(game.players[me].champion);
  renderer.player = me;
  renderer.update(game);
  const practice = room.mode === 'practice';
  $('#room-label').textContent = practice ? 'SOLO PRACTICE' : `ROOM ${room.code}`;
  $('#copy-room').hidden = practice;
  $('#reset-practice').hidden = !practice;
  const practiceURL = `?practice=1${game.players[me].champion !== 'zed' ? `&champion=${game.players[me].champion}` : ''}`;
  if (practice && location.search !== practiceURL) history.replaceState({}, '', `${basePath}${practiceURL}`);
  $('#leave').hidden = false;
  $('#killcam-bar').hidden = !renderer.killcam.active;
  if (renderer.killcam.active) {
    controls.attackMovePending = false;
    controls.hovered = null;
    overlay('');
    return;
  }
  renderHUD(game, room);
  if (game.phase === 'active') overlay('');
  else if (game.phase === 'countdown')
    overlay(`<div class="countdown"><strong>${Math.ceil(game.countdown)}</strong></div>`);
  else if (game.phase === 'finished' && practice) {
    overlay(
      `<div class="lobby-card result"><h2>Dummy defeated.</h2>${matchSummary(game, me, practice)}<button id="practice-again" class="primary">Practice again ${icon('arrow')}</button></div>`,
    );
  } else if (game.phase === 'finished') {
    const title = game.winner === 'draw' ? 'Draw' : game.winner === me ? 'Victory' : 'Defeat';
    overlay(
      `<div class="lobby-card result"><h2>${title}</h2>${matchSummary(game, me, practice)}<button id="ready" class="primary" ${ready[me] ? 'disabled' : ''}>${ready[me] ? 'Waiting for opponent…' : 'Rematch'} ${icon('arrow')}</button><small>${ready[1 - me] ? 'Opponent ready' : 'Rematch requires both players.'}</small></div>`,
    );
  } else {
    overlay(
      `<div class="lobby-card waiting"><h2>${connected.every(Boolean) ? 'Ready to duel' : 'Waiting for opponent'}</h2><div class="room-code">${room.code}</div>${championPicker(game.players[me].champion)}<div class="player-dots"><span class="color-0"><i></i>${championName(game.players[0].champion).toUpperCase()} ${ready[0] ? '· READY' : connected[0] ? '· HERE' : '· WAITING'}</span><span class="color-1"><i></i>${championName(game.players[1].champion).toUpperCase()} ${ready[1] ? '· READY' : connected[1] ? '· HERE' : '· WAITING'}</span></div><button id="ready" class="primary" ${ready[me] ? 'disabled' : ''}>${ready[me] ? 'Waiting for opponent…' : 'Ready to duel'} ${icon('arrow')}</button><button id="copy-card" class="text-button">${icon('link')} Copy invite link</button></div>`,
    );
  }
}

function renderHUD(game: GameState, room: RoomState) {
  const { connected, ready } = room;
  const me = connection.player;
  const practice = room.mode === 'practice';
  for (const p of game.players) {
    const stats = championStats(p.champion);
    $(`#champion-${p.id}`).textContent = championName(p.champion).toUpperCase();
    $(`#hp-${p.id}`).innerHTML = `${Math.ceil(p.hp)} <em>/ ${stats.hp}</em>`;
    $(`#hp-fill-${p.id}`).style.width = `${(p.hp / stats.hp) * 100}%`;
    $(`#identity-${p.id}`).textContent = p.id === me ? 'YOU' : practice ? 'DUMMY' : 'OPPONENT';
    $(`#status-${p.id}`).textContent =
      p.hp <= 0
        ? 'DEFEATED'
        : p.ultimate
          ? 'UNTARGETABLE'
          : p.mark
            ? 'DEATH MARK'
            : game.phase === 'waiting'
              ? ready[p.id]
                ? 'READY'
                : connected[p.id]
                  ? 'NOT READY'
                  : 'WAITING'
              : p.airborne
                ? 'AIRBORNE'
                : p.charm && p.charm.until > game.time
                  ? 'CHARMED'
                  : p.ahri?.dash
                    ? 'SPIRIT RUSH'
                    : p.rootUntil > game.time
                      ? 'ROOTED'
                      : p.poison
                        ? 'POISONED'
                        : p.singed && p.singed.insanityUntil > game.time
                          ? 'INSANITY POTION'
                          : '';
  }
  $('#clock').textContent = duration(game.time);
  const p = game.players[me];
  for (const key of ['passive', ...SPELL_KEYS] as const) {
    const slot = $<HTMLButtonElement>(`[data-spell="${key}"]`);
    const rush = key === 'r' && p.ahri && p.ahri.rushUntil > game.time && p.ahri.rushCharges > 0;
    const remaining = Math.max(
      0,
      (rush ? p.ahri!.rushAt : key === 'passive' ? p.passiveAt : p.cooldowns[key]) - game.time,
    );
    const shadow =
      key === 'w' || key === 'r'
        ? p.shadows.find((s) => s.kind === key && !s.swapped && s.swapUntil > game.time)
        : null;
    const active =
      !!p.singed &&
      (key === 'q'
        ? p.singed.poisonOn
        : key === 'r'
          ? p.singed.insanityUntil > game.time
          : key === 'passive'
            ? p.singed.slipstreamUntil > game.time
            : false);
    slot.classList.toggle('ability-active', active);
    if (key === 'q' && p.singed) slot.setAttribute('aria-pressed', String(p.singed.poisonOn));
    else slot.removeAttribute('aria-pressed');
    slot.querySelector('.cooldown')!.textContent =
      key === 'passive' && p.ahri
        ? `${p.ahri.essenceHits ?? 0}/${AHRI_PASSIVE.hits}`
        : rush
          ? `${p.ahri!.rushCharges} · ${Math.ceil(p.ahri!.rushUntil - game.time)}s`
          : active
            ? key === 'r' || key === 'q'
              ? ''
              : 'ON'
            : shadow
              ? '↔'
              : remaining > 0
                ? remaining >= 10
                  ? `${Math.ceil(remaining)}`
                  : remaining.toFixed(1)
                : '';
    slot.classList.toggle('on-cooldown', remaining > 0 && !shadow && !active);
    slot.classList.toggle('recast', !!shadow || !!rush);
    slot.classList.toggle('charge-window', !!rush);
    slot.classList.toggle('passive-counter', key === 'passive' && !!p.ahri);
  }
}
renderer.onReplayFrame = (game) => {
  if (connection.room) renderHUD(game, connection.room);
};
renderer.onReplayEnd = () => {
  if (connection.room) renderRoom(connection.room);
};

connection.addEventListener('connection', (event) => {
  const online = (event as CustomEvent<boolean>).detail;
  $('#connection').innerHTML = `<i></i>${online ? '' : 'Disconnected'}`;
  $('#connection').classList.toggle('online', online);
  $('#connection').title = online ? 'Connected' : 'Disconnected';
  if (online) {
    showLobby();
    if (solo) connect({ type: 'practice', champion: selectedChampion });
    else if (invite) connect({ type: 'join', code: invite, champion: selectedChampion });
  } else {
    renderer.clear();
    $('#killcam-bar').hidden = true;
    overlay(
      '<div class="lobby-card"><h2>Disconnected</h2><p>Reconnect to start a new duel.</p><button id="reconnect" class="primary">Reconnect</button></div>',
    );
  }
});
connection.addEventListener('connecting', (event) => {
  overlay(
    '<div class="lobby-card"><h2>Connecting…</h2><p id="connection-progress"></p><button id="cancel-connect" class="secondary">Cancel</button></div>',
  );
  $('#connection-progress').textContent = (event as CustomEvent<string>).detail;
});
connection.addEventListener('connection-failed', (event) => {
  overlay(
    '<div class="lobby-card"><h2>Connection failed</h2><p id="connection-error" role="alert"></p><button id="retry-connect" class="primary">Try again</button><button id="cancel-connect" class="secondary">Back</button></div>',
  );
  $('#connection-error').textContent = (event as CustomEvent<string>).detail;
});
connection.addEventListener('state', (event) => renderRoom((event as CustomEvent<RoomState>).detail));
connection.addEventListener('incompatible-server', () => {
  renderer.clear();
  $('#killcam-bar').hidden = true;
  $('#reset-practice').hidden = true;
  overlay(
    import.meta.env.VITE_MULTIPLAYER === 'peer'
      ? '<div class="lobby-card"><h2>Update both players</h2><p>The host is using an older game version. Both players should reload the page, then create and join a new duel.</p><button id="reconnect" class="primary">Reload</button></div>'
      : '<div class="lobby-card"><h2>Restart the local server</h2><p>This page is connected to an older server. In its terminal, press Ctrl+C and run <code>npm run dev</code> again, then reload this page.</p><button id="reconnect" class="primary">Reload</button></div>',
  );
});
connection.addEventListener('joined', (event) => {
  const { code } = (event as CustomEvent<{ code: string }>).detail;
  history.replaceState({}, '', `${basePath}?room=${code}`);
});
connection.addEventListener('error', (event) => toast((event as CustomEvent<string>).detail));
connection.addEventListener('latency', () => {
  $('#latency').textContent = `${connection.latency} ms`;
});
connection.addEventListener('left', () => {
  history.replaceState({}, '', basePath);
  invite = '';
  solo = false;
  renderer.clear();
  $('#copy-room').hidden = true;
  $('#leave').hidden = true;
  $('#room-label').textContent = '';
  showLobby();
});

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Invite link copied. Send it to your opponent.');
  } catch {
    toast(
      `Room ${connection.room?.code}. Share this page’s URL; on LAN, use the host computer’s IP address.`,
    );
  }
}
document.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest('button');
  if (!button) return;
  if (button.id === 'skip-killcam') {
    renderer.killcam.skip();
    if (connection.room) renderRoom(connection.room);
  }
  if (button.id === 'create-room') connect({ type: 'create', champion: selectedChampion });
  if (button.id === 'practice') connect({ type: 'practice', champion: selectedChampion });
  if (button.id === 'reset-practice' || button.id === 'practice-again')
    connection.send({ type: 'reset-practice' });
  if (button.id === 'ready') connection.send({ type: 'ready' });
  if (button.id === 'copy-room' || button.id === 'copy-card') void copyInvite();
  if (button.id === 'leave' || button.id === 'cancel-connect') connection.send({ type: 'leave' });
  if (button.id === 'retry-connect' && lastConnectionRequest) connect(lastConnectionRequest);
  if (button.id === 'reconnect') location.reload();
});
$('#overlay').addEventListener('submit', (event) => {
  event.preventDefault();
  if ((event.target as HTMLFormElement).id === 'join-form')
    connect({
      type: 'join',
      code: $<HTMLInputElement>('#room-code').value.trim().toUpperCase(),
      champion: selectedChampion,
    });
});
for (const key of SPELL_KEYS) {
  const slot = $(`[data-spell="${key}"]`);
  slot.addEventListener('mouseenter', () => {
    controls.hovered = key;
  });
  slot.addEventListener('mouseleave', () => {
    controls.hovered = null;
  });
  slot.addEventListener('focus', () => {
    controls.hovered = key;
  });
  slot.addEventListener('blur', () => {
    controls.hovered = null;
  });
}

const dialog = $<HTMLDialogElement>('#settings-dialog');
function bindingFields(bindings: Bindings) {
  $('#binding-fields').innerHTML = Object.entries(bindings)
    .map(
      ([key, value]) =>
        `<label><span>${key === 'stop' ? 'Stop' : key === 'attackMove' ? 'Attack move' : championSpells(displayedChampion ?? 'zed')[key as keyof typeof SPELLS].name}</span><input name="${key}" aria-label="${key} binding" value="${bindingLabel(value)}" maxlength="5" pattern="[A-Za-z0-9]|[Ss][Pp][Aa][Cc][Ee]" required autocomplete="off"></label>`,
    )
    .join('');
}
function updateKeys() {
  for (const key of SPELL_KEYS) $(`[data-key="${key}"]`).textContent = bindingLabel(controls.bindings[key]);
  $('#attack-move-key').textContent = bindingLabel(controls.bindings.attackMove);
  $('#stop-key').textContent = bindingLabel(controls.bindings.stop);
}
$('#settings').addEventListener('click', () => {
  controls.attackMovePending = false;
  bindingFields(controls.bindings);
  dialog.showModal();
});
$('#close-settings').addEventListener('click', () => dialog.close());
$('#reset-bindings').addEventListener('click', () => bindingFields(DEFAULT_BINDINGS));
$('#binding-fields').addEventListener('keydown', (event) => {
  const field = event.target;
  if (!(field instanceof HTMLInputElement) || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = normalizeBinding(event.key);
  if (!isBinding(key)) return;
  event.preventDefault();
  field.value = bindingLabel(key);
});
$('#bindings-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(
    [...new FormData(event.target as HTMLFormElement)].map(([key, value]) => [
      key,
      normalizeBinding(String(value)),
    ]),
  ) as Bindings;
  if (!Object.values(values).every(isBinding)) {
    toast('Use a letter, number or Space.');
    return;
  }
  if (new Set(Object.values(values)).size !== Object.keys(DEFAULT_BINDINGS).length) {
    toast('Give each action a different key.');
    return;
  }
  controls.save(values);
  updateKeys();
  dialog.close();
  toast('Controls saved.');
});
updateKeys();
showLobby();
