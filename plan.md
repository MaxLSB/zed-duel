# Zed Duel — implementation plan

Updated: 2026-10-24. Status: first playable draft implemented and locally validated.

## Objective

Build a clean, minimalist browser game for two human players fighting as level-18 Zed in a small rectangular arena. Preserve League of Legends PC combat values and relevant mechanics, including basic attacks, passive, Q/W/E/R, Flash, and Ignite.

Project directory: `/Users/maxence.lasbordes/Documents/Perso/zed`.

## Confirmed decisions

- Two computers connected over LAN or online, one browser per player.
- League-style controls: right-click movement/attacks, A/Z/E/R, D/F (AZERTY defaults).
- Single-round duels. A kill ends the round; both players can request a rematch.
- A new duel resets HP, energy, cooldowns, and all temporary combat state.
- Both players have identical level-18 stats, no items, runes, or other bonuses.
- Minimalist presentation in a small rectangular arena.

- Cooldown override requested during playtesting: divide ability, summoner and passive cooldowns by 3 in all modes.

- Playtesting changes: remove energy as a resource; expand the arena and reduce the interface to essential combat and room controls.

- Latest playtesting changes: Space is a valid binding; remove Ignite; set Flash and ultimate cooldowns to 10 seconds; enlarge shurikens by roughly 10% and reduce Q cast delay to 0.22 seconds.

- Controls: S cancels movement and attacks, including held right-click; Q then left-click issues attack-move with a range indicator. Both actions can be rebound.
- Combat polish: verify E damage only once across player/W/R shadows, including delayed hits; remove R’s extra return delay after landing.
- Spell flow: a 250 ms server-side input buffer preserves early follow-up spells, with latest-waiting-spell replacement and cancellation by S/movement/attacks. Out-of-range R follows its target and casts on entering range; Flash preserves the approach.
- Post-match: three-second killcam at 0.75× speed and 1.22× zoom, skip control, and a two-player comparison of duration, shuriken accuracy, damage and basic attacks.
- Passive cooldown: set to 10 seconds, overriding the earlier global cooldown division.
- Stop diagnosis: the user’s saved Stop binding was Space. Restoring it to S resolved the reported issue; temporary input tracing was removed.
- Stop input: allow the configured stop key during active play when Control remains held after a right-click. Verified the browser sends Stop and movement stays cancelled.
- Stop fix: accept S during ultimate and suppress the automatic attack on landing; restore keyboard focus on arena clicks.
- Shurikens pierce opponents and continue to full range; each projectile damages an opponent only once.
- Visual cleanup: hide shadow timers and the player label; enlarge shurikens again (120-unit width); keep the Death Mark cross and countdown without red target circles.
- Ultimate feedback: smoke vanish, shadow approach, reappearance slash and a red Death Mark countdown; hide the body and overhead health bar during the existing untargetable window.

## Working defaults

- Standard PC Summoner's Rift balance; the custom arena does not imply Riot's Arena-mode modifiers.
- Q/W/E at rank 5 and R at rank 3.
- Top-down 2D view, fixed camera showing the entire arena.
- Original simple ninja silhouettes, restrained effects, distinct player colors and readable shadows.
- Start with an unobstructed 2400 × 1400 game-unit rectangle; tune arena size through playtesting while preserving spell ranges and movement speed.
- Quick-cast toward the cursor; targeted actions require a valid enemy. D = Flash, F = Ignite; allow rebinding, including AZERTY layouts.
- Right-click enemy to approach and auto-attack; S stops movement/attacking. Show aiming/range feedback without changing hitboxes.
- Room code or invite URL, two-player capacity, ready state and short countdown. No accounts or matchmaking in version one.
- Simultaneous lethal damage within the same simulation step produces a draw. Rematches require both players to agree.
- No minions, towers, terrain obstacles, shop, leveling, fog of war, or bots in the first version.

## Research baseline

Target patch: **26.21**, with Data Dragon version **16.21.1**, based on [Riot's patch notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-21-notes/) and [version list](https://ddragon.leagueoflegends.com/api/versions.json). Freeze the selected data in the repository instead of fetching changing balance values during gameplay.

Initial level-18 calculations from the [Zed reference](https://wiki.leagueoflegends.com/en-us/Zed):

| Stat | Value |
| --- | --- |
| HP | 2337 = 654 + 17 × 99 |
| HP regeneration | 18.05 per 5 seconds |
| Energy / regeneration | 200 / 10 per second |
| Attack damage | 120.8 = 63 + 17 × 3.4 |
| Armor | 111.9 |
| Magic resistance | 63.85 |
| Movement speed | 345 |
| Attack speed | 1.016211 attacks/second |
| Attack range | 125 |

Initial max-rank ability values from the same reference:

| Ability | Cooldown | Energy | Key value |
| --- | --- | --- | --- |
| Passive | 10s per target | — | Below 50% HP: 10% maximum HP magic damage |
| Q | 6s | 55 | 240 physical damage; range 925 |
| W | 16s | 20 | Range 650; swap; 50-energy duplicate-hit refund |
| E | 3s | 40 | See updated damage below |
| R | 100s | 0 | Range 625; 3s mark; 120.8 + 55% stored pre-mitigation physical/magic damage |

E deals **160 physical damage** without bonus AD; [Riot's 26.10 notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-10-notes/) supersede the older 170-damage wiki snapshot. Level growth contributes base AD, so it must not be counted as bonus AD for Q/E scaling.

| Summoner | Cooldown | Range | Effect |
| --- | --- | --- | --- |
| Flash | 300s | 400 | Blink toward cursor, clamped to arena |
| Ignite | 180s | 600 | 475 true damage over 5s at level 18; 40% healing reduction |

Sources: [Flash](https://wiki.leagueoflegends.com/en-us/Flash), [Ignite](https://wiki.leagueoflegends.com/en-us/Ignite). Preserve actual in-round cooldowns; rematch resets are a separate match rule.

### Verification still required before combat constants are finalized

The search index and opened wiki page returned different revisions. The version-specific Data Dragon champion file was subsequently fetched during implementation. It confirms most base stats, costs and cooldowns, but differs on AD growth and some ranges. See `docs/combat.md` for the selected values, source discrepancies and remaining timing approximations. Complete patch parity still requires an in-client comparison.

- Cross-check base stats and ability values against the pinned Riot data and subsequent patch changes.
- Record cast delays, projectile dimensions/speed, attack windup, collision radii, range measurement conventions, shadow lifetime, swap windows and cooldown start times.
- Specify shadow replication and refund rules, overlapping-hit behavior, slow stacking, and cooldown reductions.
- Specify ultimate targeting, movement, damage accounting, and interactions with the other player's ultimate and existing damage-over-time effects.
- Check Ignite tick timing and regeneration reduction. Do not assume untargetability means immunity to existing damage.
- Keep a source and verification status beside each nontrivial constant; list unresolved differences explicitly.

## Proposed implementation

Use TypeScript for a shared deterministic combat simulation, a Canvas 2D browser renderer, and an authoritative room server. Keep simulation, transport, and rendering separate so combat can be tested without a browser and the hosting adapter can change without rewriting the rules.

- Server owns movement validation, energy, cooldowns, hits, damage, death, and match state. Clients send intents, never claimed damage or positions.
- Fixed simulation timestep, initially 60 Hz; snapshot updates initially 20 Hz. Use interpolation for opponents and prediction/reconciliation for local movement.
- WebSocket room transport with validated messages, input sequence numbers, rate limits, and explicit disconnect handling.
- Start with a local server reachable by two LAN clients. Internet play requires a reachable authoritative service; a static website alone is insufficient.
- Confirm the hosted runtime supports persistent room ownership and WebSocket simulation before selecting the deployment adapter. A Node.js server is the local/LAN baseline; Sites compatibility must be verified for hosting.
- Keep numeric precision internally; round displayed HP/cooldowns only.

Suggested structure:

```text
src/shared/       balance, geometry, combat, match state, protocol
src/client/       canvas rendering, input, HUD, room screens
src/server/       room lifecycle, simulation loop, transport
tests/           combat fixtures and multiplayer integration tests
plan.md          decisions and implementation progress
README.md        setup, controls, LAN/online instructions, known differences
```

## Implementation milestones

1. **Lock combat specification.** Resolve research discrepancies and write sourced balance constants plus expected damage examples.
2. **Build the playable foundation.** Arena, movement, collision, basic attacks, HP/energy, regeneration, death, and a development harness for two actors.
3. **Implement the complete kit.** Passive, Q, W, E, R, Flash and Ignite with timers, state transitions, targeting and shadow interactions.
4. **Connect two real players.** Authoritative rooms, join/ready flow, synchronized start, networking feedback, disconnect handling and rematches.
5. **Finish the minimalist interface.** Health/energy bars, ability cooldowns and costs, shadow/recast indicators, ultimate countdown, clear impacts and result overlay. Keep room entry and rematching short.
6. **Validate and hand off.** Run combat tests, exercise two independent browsers and LAN devices where available, verify production build, and document launch/deployment steps and any remaining fidelity limitations.

## Acceptance checks

- Two human players can join one room, fight, see the same result and rematch without restarting the server.
- All seven kit components plus basic attacks work; invalid casts consume neither energy nor cooldown.
- Test damage mitigation, passive threshold boundaries, duplicate hits, refunds, shadow swaps/expiry, ultimate interactions, summoner timing and complete rematch cleanup.
- Test stale/duplicate/malformed input, a third player joining, disconnects, and simulated network delay.
- Test arena boundaries and spell targeting at multiple viewport sizes; resizing must not change world distances.
- Compare representative combo damage and timing against the pinned specification. Do not claim exact parity while material discrepancies remain unresolved.
- Report which checks actually ran, including whether real two-device and internet play were exercised.

## Progress

- [x] Inspect project directory.
- [x] Confirm multiplayer mode, controls and match format.
- [x] Research initial champion/summoner values and identify source-version differences.
- [x] Create this plan.
- [x] Record the first-draft combat specification and source discrepancies in `docs/combat.md`.
- [x] Implement milestones 2–5: full kit, authoritative rooms and minimalist interface.
- [x] Add solo practice with a stationary opponent and instant reset (requested during local testing).
- [x] Complete automated combat, transport and two-browser checks, production build and launch documentation.
- [ ] Compare edge-case timings and disputed constants against the League client.
- [ ] Add client movement prediction/reconciliation and latency compensation.
- [ ] Verify on two physical devices over separate internet connections; browser-hosted Pages deployment supersedes the internet room-server plan.

## GitHub Pages deployment PR

- Target `main` only; leave `feat/singed` and the portfolio repository untouched.
- Publish only this repository’s `/zed-duel/` project site after merge, through GitHub Actions.
- Browser-hosted authoritative simulation in a Web Worker, with PeerJS signaling and WebRTC data channels.
- Preserve Node/LAN mode, gameplay, controls, rematches and killcam.
- Solo practice runs without a game server or signaling service.
- Validate static subpath navigation, two-browser peer duels, connection failures and session cleanup.

- [x] Implement browser hosting, signaling, project-path navigation and Pages CI.
- [x] Pass 50 unit/session tests, 12 LAN browser scenarios and 3 Pages browser scenarios.
- [x] Connect two browser contexts through the default public PeerJS service and start a duel.
- [ ] Enable GitHub Pages, merge the PR and verify the published invite on separate internet connections.
