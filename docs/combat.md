# Combat baseline

Research date: 2026-10-24. Target: PC Summoner's Rift, patch 26.21, max-rank abilities, level 18, no items or runes. Constants live in `src/shared/balance.ts` and never update during a match.

User-requested overrides: Ignite is removed. Flash, Death Mark and the passive have 10-second cooldowns. Q/W/E and the ultimate cancellation cooldown retain the global divisor of **3**. Shuriken width is 120 units and its cast delay is 0.22 seconds. R has no extra return delay after landing. Other timings and E’s flat W cooldown reduction are unchanged. Tooltips derive their cooldown values from the same constants as the simulation.

Energy costs, regeneration and shadow energy refunds are disabled by user request. Spells are constrained by targeting, cast state and cooldowns only.

Each E cast shares one damage instance across Zed and all shadows, including delayed shadow hits; Death Mark stores that damage once.

## Input buffering

The server keeps one waiting spell per player for 250 ms, with one simulation tick of expiry tolerance. Inputs retain their original aim and target. Only near-ready casts are accepted; cooldowns start on execution. Instant E and Flash can execute without dropping a different waiting spell. S, movement and attack orders cancel the buffer; death, round resets and disconnects clear it. Recasts retain their shadow identity so an expired swap cannot become a fresh cast.

An initial R ordered outside casting range follows its target until in range. The order is cancelled by S, movement/attack orders, another accepted champion spell or an invalid target. Flash preserves the approach order. No cooldown is spent while approaching.

The 250 ms window is a game-specific tuning choice. [Riot’s patch 9.1 notes](https://www.leagueoflegends.com/en-gb/news/game-updates/patch-9-1-notes/) document ability-specific buffering; this draft does not claim every League interaction matches exactly.

## Sources and conflicts

- [Riot Data Dragon 16.21.1](https://ddragon.leagueoflegends.com/cdn/16.21.1/data/en_US/champion/Zed.json): successfully fetched and used to cross-check HP, defenses, regeneration, speed, energy costs and cooldowns. The numerical subset is saved in `data/riot-zed-16.21.1.json`.
- [Zed mechanics reference](https://wiki.leagueoflegends.com/en-us/Zed): supplemental mechanics and collision/timing data. Cached revisions differ, so newer patch notes take precedence.
- [Riot patch 26.10](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-10-notes/): the E damage correction used by this draft.
- [Flash](https://wiki.leagueoflegends.com/en-us/Flash) and [Ignite](https://wiki.leagueoflegends.com/en-us/Ignite): summoner values and timing.

Data Dragon reports AD growth as zero, Q range as 900, and E range as 290. The mechanics reference instead supports AD growth 3.4, Q travel 925, and separate E radii 315/290. The draft deliberately uses the latter values; these differences still need an in-client comparison. Tooltip formula placeholders in Data Dragon do not independently verify damage coefficients.

## Explicit approximations

- All simulation events resolve on a 60 Hz clock; this does not reproduce Riot's internal scheduler.
- The ultimate displays a smoke vanish and interpolated shadow trail before reappearing; the intermediate dash trajectory is visual only. The server still resolves the landing after the existing delay. Distance cancellation is checked before the dash.
- Basic-attack range uses champion radii plus attack range, with a small windup completion tolerance. Body separation uses circular colliders; there is no terrain navigation.
- Shadow casts during travel are deferred until arrival. Some League buffering quirks, minimum-placement details and exact expiry grace windows remain unverified.
- An already applied mark can damage an untargetable player. Targeting an untargetable opponent is rejected.
- Same-step lethal damage produces a draw; the duel ends immediately after that step.

The tests verify the draft's specified behavior. They do not establish frame-perfect equivalence with the League client.
