# Zed / Duel

A minimalist, two-player browser duel with level-18 Zed, the full champion kit and Flash. Separate TypeScript modules handle combat, rooms, input, rendering and UI. The server owns the match; clients send input commands.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:3000**, create a duel, and share the room code. The server prints its LAN address. On another computer on the same network, open that LAN address and join the room. A `localhost` invite only works on the host computer; replace that hostname with the printed LAN IP when sharing it. Both players click **Ready to duel**.

You can also test with two browser tabs. The second tab can open the first tab's invite URL.

For solo testing, click **Practice solo · stationary dummy**, or open **http://localhost:3000/?practice=1**. You start immediately within spell range of a stationary opponent that never attacks. **Reset practice** restores both players, clears all effects, and refreshes every cooldown. After defeating the dummy, click **Practice again**. Combat values remain the same as in a duel.

Flash, Death Mark and the passive have **10-second cooldowns**. Q/W/E retain their cooldowns divided by **3**. Shuriken width is 120 units and its cast delay is 0.22 seconds. Spells have no energy costs; only cooldowns limit casting. Cast times, effect durations and attack speed retain their original values.

## Controls

| Input | Action |
| --- | --- |
| Right-click floor / hold and drag | Move |
| Right-click opponent | Approach and auto-attack |
| S | Stop movement and attacks |
| Q then left-click | Attack-move (Escape or right-click cancels targeting) |
| A | Shuriken toward cursor |
| Z / Z again | Place shadow / swap |
| E | Slash |
| R over opponent / R again | Move into range and cast Death Mark / return |
| D | Flash toward cursor |

Use the settings button to rebind keys, including for AZERTY keyboards. Click a binding and press a letter, number or Space; Space works for any spell, summoner or Stop. Each action needs a unique key. Hover an ability to see its description and range. The arena fills the available viewport with a compact health and ability HUD. Both players must agree to a rematch. A disconnect cancels the current duel and returns the remaining player to the room.

Spells pressed up to 250 ms before a cast lock, cooldown or recast lock ends are buffered and fire when legal. The latest waiting spell replaces the previous one; its aim is kept from the original input. Ready E and Flash remain immediate. S, movement and attack orders cancel waiting spells. An out-of-range R follows its target until casting range, spending its cooldown only when it casts; S or a new movement order cancels the approach. Flash can bring a pending R into range.

After a kill, both players see the last three seconds at 0.75× speed and 1.22× zoom, with a Skip button. The result then compares match duration, shurikens hit/missed, accuracy, damage dealt and basic attacks hit. Shurikens are counted per projectile, including shadows; any thrown projectile that has not hit when the round ends counts as a miss. Damage is actual HP removed after defenses, excluding overkill. Stats and replay history reset each round.

## Structure

```text
src/shared/balance.ts     Combat constants
src/shared/game.ts        Fixed-step combat simulation
src/shared/spell-buffer.ts  Short, cancellable spell input buffer
src/shared/player.ts      Player initialization
src/shared/geometry.ts    Collision and movement helpers
src/shared/protocol.ts    Network message validation
src/shared/types.ts       Shared state and message contracts
src/server/room.ts        Two-player room lifecycle
src/server/app.ts         HTTP, WebSocket, simulation scheduling
src/client/network.ts     Browser connection
src/client/input.ts       Mouse and rebindable keyboard controls
src/client/renderer.ts    Canvas arena, characters and effects
src/client/ultimate-effects.ts  Ultimate smoke, dash, marks and detonation
src/client/killcam.ts           Bounded snapshot history and replay timeline
src/client/match-summary.ts     Compact post-match comparison
src/client/main.ts        Lobby, match HUD and settings
tests/                   Combat, transport and browser checks
docs/combat.md           Sources and fidelity notes
```

E deals damage only once per cast, even when Zed and both shadows hit. R can return to its shadow immediately after landing, with no extra recast delay.

The ultimate hides Zed and his overhead health bar during its untargetable approach, with smoke, a shadow streak, a reappearance slash and a visible Death Mark countdown.

The simulation runs at 60 Hz and broadcasts at 20 Hz. Rendering interpolates positions and snaps teleports. Room state is in memory; restarting the server clears rooms. No account or database is required.

## Checks

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

For an installed Chrome browser, use `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`. The browser tests start their own server on port 3100 and save screenshots in `test-results/`.

The draft was checked with 46 combat/protocol/replay/transport tests and twelve Playwright scenarios using independent Chrome sessions. These cover joining, readiness, room capacity, stale commands, damage synchronization, disconnects, rematch resets, key rebinding, attack-move, stopping right-click movement with Control held and ultimate follow-up attacks, killcam playback, match statistics, narrow layouts, and solo practice. A real second device and a public internet deployment have not been tested.

## Internet hosting

```sh
npm run build
PORT=3000 npm start
```

Deploy the repository to a Node-capable host that supports long-lived WebSocket connections. The same process serves `dist/` and `/ws`. Use one server instance initially; a load-balanced deployment needs shared room ownership or sticky routing. For HTTPS, forward WebSocket upgrades through the reverse proxy and preserve the original `Host` header. `/health` is the health-check endpoint.

This draft is a local/LAN implementation with an internet-capable transport. It has not been published to Sites: its persistent Node room server needs a compatible hosting adapter before that deployment path can be used.

## Draft limitations

- Original geometric visuals; no League assets, audio or animation rig.
- Researched balance values, with documented source discrepancies and timing approximations. Exact League parity has not been established.
- Server-authoritative movement with interpolation; client prediction, reconciliation and lag compensation are follow-up work.
- Out-of-range targeted casts are rejected rather than queued with automatic approach.
- Rejoining after a lost connection starts fresh; no reconnect grace period or spectators.
- Optional Google Fonts fall back to local system fonts offline.

An unofficial fan prototype, not affiliated with Riot Games.
