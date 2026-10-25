# Zed / Duel

A minimalist, two-player browser duel with level-18 Zed or Singed, full champion kits and Flash. Zed remains the default. Separate TypeScript modules handle combat, rooms, input, rendering and UI. The match host owns the simulation; guests send input commands. The GitHub Pages build hosts matches in a player’s browser, while local/LAN mode retains the Node server.

## Play on GitHub Pages

Deploy this repository’s project page at **https://maxlsb.github.io/zed-duel/** without changing the portfolio. Players create a duel and share an invite; Cloudflare handles room signaling and supplies temporary TURN relay credentials; one player’s browser hosts the match. The Cloudflare Worker and TURN key must be configured before publishing this build. No hosted Node game server is required. See [Pages setup and hosting details](docs/github-pages.md).

## Run

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:3000**, create a duel, and share the room code. The server prints its LAN address. On another computer on the same network, open that LAN address and join the room. A `localhost` invite only works on the host computer; replace that hostname with the printed LAN IP when sharing it. Each player chooses **Zed** or **Singed**, then both click **Ready to duel**. You can change your champion in the waiting room; changing a pick clears both ready flags. Choices are locked during a round and kept for rematches.

You can also test with two browser tabs. The second tab can open the first tab's invite URL.

For solo testing, click **Practice solo · stationary dummy**, or open **http://localhost:3000/?practice=1**. You start immediately within spell range of a stationary opponent that never attacks. **Reset practice** restores both players, clears all effects, and refreshes every cooldown. After defeating the dummy, click **Practice again**. Combat values remain the same as in a duel.

Flash, Death Mark and the passive have **10-second cooldowns**. Q/W/E retain their cooldowns divided by **3**. Shuriken width is 120 units and its cast delay is 0.22 seconds. Spells have no energy costs; only cooldowns limit casting. Cast times, effect durations and attack speed retain their original values.

## Singed

Choose **Singed** in the lobby for a duel or practice, or open **http://localhost:3000/?practice=1&champion=singed**. Practice keeps the same stationary Zed dummy; Fling can displace it, and Reset practice restores its position. Reloading the practice URL preserves your champion. Duels support both mixed and mirror matchups in Node/LAN mode and in the browser-hosted GitHub Pages build. The Pages practice URL is `/zed-duel/?practice=1&champion=singed`.

The same bindings, movement, input buffer, Flash, killcam and resets apply. Default Singed bindings:

| Input | Action |
| --- | --- |
| A | Toggle Poison Trail |
| Z | Throw Mega Adhesive toward the cursor |
| E over opponent | Approach and Fling; landing in your adhesive roots |
| R | Drink Insanity Potion |
| D | Flash toward the cursor |

Noxious Slipstream activates near the opponent. Poison clouds linger after toggling off; overlapping clouds do not stack damage. Adhesive slows and grounds enemies, preventing Flash and Zed's R and shadow swaps. Fling briefly knocks the opponent airborne. The potion boosts stats and makes poison reduce healing. Active poison and potion duration are visible in the HUD.

Like Zed, Singed has no resource costs, Q/W/E cooldowns divided by three, and 10-second passive/R/Flash cooldowns. Potion lasts 25 seconds; recasting refreshes its duration without stacking stats. Each champion uses its own health, defenses, regeneration and attack timing. Shared keybindings remain saved in the same browser settings. See [Singed combat notes](docs/singed.md) for researched values, sources and approximations.

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
src/shared/balance.ts     Original Zed combat constants
src/shared/singed-balance.ts  Singed stats and spell constants
src/shared/champions.ts     Champion stat and spell lookups
src/shared/singed.ts        Poison, adhesive, Fling and potion simulation
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
src/client/singed-effects.ts    Singed body, clouds, adhesive and potion visuals
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

The automated checks cover combat, protocol validation, browser-hosted sessions, Node/LAN duels and Cloudflare room signaling. Browser tests exercise room codes, invitations, a full duel and rematch, champion selection, offline practice, timeouts, retry/cancel, disconnects and guest rejoining. Local Cloudflare tests deliberately bypass external TURN; passing them does not prove that the deployed relay works across different networks. See [Cloudflare setup and relay validation](docs/github-pages.md).

The Singed branch adds combat/protocol, connection and in-memory room checks, plus four Playwright scenarios for character selection, mixed rooms and solo practice across the Node and Pages transports. See [the validation notes](docs/singed.md#validation) for what was run in the implementation environment.

## Internet hosting

```sh
npm run build
PORT=3000 npm start
```

Deploy the repository to a Node-capable host that supports long-lived WebSocket connections. The same process serves `dist/` and `/ws`. Use one server instance initially; a load-balanced deployment needs shared room ownership or sticky routing. For HTTPS, forward WebSocket upgrades through the reverse proxy and preserve the original `Host` header. `/health` is the health-check endpoint.

This Node deployment is an alternative to the browser-hosted GitHub Pages build. See [Pages setup](docs/github-pages.md) for the static deployment workflow.

## Draft limitations

- Original geometric visuals; no League assets, audio or animation rig.
- Researched balance values, with documented source discrepancies and timing approximations. Exact League parity has not been established.
- Server-authoritative movement with interpolation; client prediction, reconciliation and lag compensation are follow-up work.
- Out-of-range Death Mark and Fling approach their target automatically. Location-targeted casts clamp to maximum range.
- Rejoining after a lost connection starts fresh; no reconnect grace period or spectators.
- Optional Google Fonts fall back to local system fonts offline.

An unofficial fan prototype, not affiliated with Riot Games.
