# LeBlanc combat notes

Research date: 2026-10-26. Fixed level-18, maximum-rank prototype with no items or mana. LeBlanc shares the roster's original Canvas geometry, SVG icons, input bindings, spell buffer and authoritative simulation.

## Research

- [Riot's champion page](https://www.leagueoflegends.com/en-us/champions/leblanc/) identifies her illusion-based assassin/mage kit, low-health invisibility, mirror image and detonating sigil.
- [Riot patch 26.13](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-13-notes/) confirms maximum-rank Mimic damage: 230 initial / 460 follow-up for Sigil and Chains, and 480 for Distortion.
- [Riot patch 26.17](https://www.leagueoflegends.com/fr-fr/news/game-updates/league-of-legends-patch-26-17-notes/) confirms the 0.625 attack-speed ratio, 1.5% growth and 235 base damage for maximum-rank Distortion. Arena-specific changes are not used as Summoner's Rift balance.
- [LeBlanc mechanics reference](https://wiki.leagueoflegends.com/en-us/LeBlanc) supplements the official descriptions with independent return points, the 0.2s return delay after dashing, a 4s return window after landing, 950-unit Chains range, 865-unit tether range, projectile speeds and Flash preserving stealth.

Riot Data Dragon `16.21.1` could not be fetched here. The remaining stats and timing values are a fixed prototype baseline, not a fully verified live data snapshot. Attack windup uses the same 20% approximation as Ahri. Exact League parity and matchup balance are not established.

## Duel kit

Default bindings remain A/Z/E/R/D, with the same saved rebinding settings as other champions.

| Ability | Behavior | Cooldown |
| --- | --- | --- |
| Mirror Image | Damage below 40% HP grants 1s invisibility and an automatic, harmless visual decoy lasting 8s | 10s |
| A · Sigil of Malice | Target opponent within 700 units plus their radius; approach if needed. A homing missile deals 165 magic damage and marks for 3.5s; the next damaging ability detonates for another 165 | 2s |
| Z · Distortion | Dash up to 600 units; deal 235 magic damage in a 240-radius area at arrival. Recast after the dash plus 0.2s to return; pad lasts 4s after landing | 10/3s |
| E · Ethereal Chains | 950-unit skillshot deals 130 magic damage. Maintain the tether for 1.5s to deal another 260 and root for 1.5s. Separation beyond 865 units breaks it | 11/3s |
| R · Mimic | Repeat the last basic spell: Sigil 230 + 460; Distortion 480; Chains 230 + 460. Mimicked Distortion has its own return point | 10s |
| D · Flash | Shared 400-unit blink; preserves stealth | 10s |

Q/W/E cooldowns are divided by three. Passive, Mimic and Flash follow the game's 10-second convention. All spell damage is magic and uses the defender's actual resistances, including Insanity Potion. Basic attacks are ranged physical attacks and never detonate sigils. Mimicked and ordinary sigils can trigger each other. The R icon shows the last basic spell, or a dash-return countdown when available. Returns do not replace the last basic spell or restart cooldowns. A return takes precedence even if W's cooldown has already elapsed; once the pad is consumed or expires, W can dash again when ready.

## Timing and deliberate simplifications

- Q and E have 0.25s windups. Q homes at 2,000 units/s; E travels at 1,750 units/s. Distortion travels at 1,450 units/s, remains targetable, and deals damage only at arrival. All movement clamps to the existing arena bounds.
- Missing Q targets and unavailable Mimic casts spend no cooldown. Q orders approach before committing; Stop or a new movement order cancels the approach. Once committed, a cancelled Q windup still spends its cooldown in this prototype. There are no minions or mana, and a kill ends the round, so Q's kill refund is omitted.
- Roots and adhesive block outgoing dashes, both returns and Flash. Charm and Fling interrupt Distortion and spell windups. A completed chain root also interrupts a dash. The shared 500ms buffer applies to cast and cooldown locks; new casts during a dash are rejected. Buffered returns cannot become fresh dashes after their pad expires.
- Tethers break on separation, death or target untargetability. Both normal and mimicked chains can coexist. Chain vision and true-sight rules are not modeled; the tether itself remains visible during stealth.
- Mirror Image triggers on nonlethal damage while below its threshold. It interrupts enemy attack windups and targeted pursuit. Stealth prevents new basic-attack, targeted-spell and homing-spell acquisition, but existing missiles, skillshots, poison and area damage can still connect. Attacks and fresh champion spell casts reveal LeBlanc; Flash and return recasts preserve stealth.
- The mirror is an automatic visual decoy moving away from the enemy. It has no damage, collision, health, targeting or manual-control system. It is translucent to its owner. This is a deliberate simplification of League's controllable, targetable clone, not a second combat unit. Opponent state is still included in snapshots, as elsewhere in this prototype; invisibility is not an anti-cheat information boundary.
- Original geometric artwork uses a split violet cloak, pale face, gold crown and staff, plus team-color outlines. Normal magic uses muted violet; Mimic uses gold. No Riot art is bundled. Both dash origins show shrinking return rings without text labels, sigils show diamonds and chains show the tether timer.

## Integration

Choose **LeBlanc** in the lobby, waiting room or results screen. Solo entry: `?practice=1&champion=leblanc`; on Pages: `/zed-duel/?practice=1&champion=leblanc`. Practice keeps the Zed dummy. Reset, rematch and disconnect clear all new combat state while preserving the appropriate champion picks. Snapshots include missiles, marks, tethers, returns and the decoy for both transports and killcam.

Deploy the updated Cloudflare relay before publishing the Pages frontend: the old relay rejects a LeBlanc guest handshake. Restart Node servers and reload both clients together. New clients reject snapshots missing the new state and show the existing update message. Deployment was not performed as part of this change.

## Validation

Combat checks cover mark detonation/expiry, damage mitigation, targeted approaches, misses, untargetability, both Mimic projectile variants, enhanced Mimic dash damage, independent returns, stale buffered returns, tether breaks/roots, interrupted casts, stealth/area-damage interactions, lethal damage and reset behavior. Node-room and browser-host checks cover serialized combat, practice reset, guest picks and rematches. Existing roster tests also run.

Validated on top of PR #9's latest commit (`914c1fa`):

- All 121 tests pass, including the real WebSocket integration test.
- All 19 Node browser scenarios and all 15 Pages/Cloudflare relay scenarios pass with installed Chrome.
- Application and Cloudflare Worker type checks pass.
- Node and Pages production builds and the Cloudflare relay dry-run bundle pass.
- Browser screenshots confirm the geometric artwork and the W origin's timer ring without a RETURN label.

The earlier sandbox restrictions were resolved by running the network and browser checks with approved permissions. Reproduce locally with:

```sh
npm test
npm run check
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
PLAYWRIGHT_CHANNEL=chrome npm run test:pages
```
