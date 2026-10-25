# GitHub Pages, Cloudflare and browser-hosted duels

The project site is **https://maxlsb.github.io/zed-duel/**. The Pages workflow publishes only this repository’s `/zed-duel/` site; it does not modify the portfolio repository or its root page.

## Architecture

One player’s browser runs the combat simulation in a Web Worker at 60 Hz and sends state at 20 Hz. The guest sends inputs over a WebRTC data channel. Both Zed and Singed, practice, rematches and killcam use the existing simulation.

A Cloudflare Worker and a SQLite-backed Durable Object per room coordinate room codes, membership and WebRTC negotiation. They do not run the simulation or carry game state. Cloudflare TURN relays encrypted traffic when a direct browser connection cannot be established. The Worker exchanges a private TURN API token for temporary credentials and sends them only to admitted room members. The private token is never included in the Pages build.

This replaces PeerJS, whose free TURN service was [discontinued](https://github.com/orgs/peers/discussions/1172). The old client still listed retired relay addresses. Testing two browser contexts on one computer did not exercise that missing fallback.

The host must keep the tab and computer open. Closing the host ends the room; a guest can rejoin an existing host, resetting the duel. Connections time out after 25 seconds with a persistent error and retry/back controls. Rooms and relay credentials last at most four hours; create a fresh room after expiry. Solo practice does not contact Cloudflare.

## Required setup before merging/publishing

1. Create a Cloudflare account and sign in with `npx wrangler login`. No domain transfer or change to GitHub Pages is required.
2. In Cloudflare **Realtime → TURN**, create a key named `zed-duel`. Keep the key ID and API token private.
3. From this repository, deploy the room service:

   ```sh
   npm ci
   npm run check
   npm run signal:deploy
   ```

   Wrangler creates `zed-duel-signal` and prints its `https://zed-duel-signal.<account-subdomain>.workers.dev` URL. Its allowed origin is `https://maxlsb.github.io`. It refuses production room creation until the TURN secrets are configured.

4. Store the two TURN values using Wrangler’s prompts. Do not paste them into chat, shell commands, GitHub variables or tracked files:

   ```sh
   npx wrangler secret put TURN_KEY_ID --env=""
   npx wrangler secret put TURN_API_TOKEN --env=""
   ```

5. In **GitHub → zed-duel → Settings → Secrets and variables → Actions → Variables**, set **VITE_SIGNAL_URL** to the Worker’s HTTPS URL. This URL is public and contains no credentials. The former `VITE_PEER_SERVER_URL` and `VITE_ICE_SERVERS` variables are no longer used.
6. Keep **Settings → Pages → Source** set to **GitHub Actions**. Merge the PR after validation. The workflow checks and publishes the frontend from `main`; it does not deploy the Worker. Future Worker changes must also be deployed with `npm run signal:deploy`.

Cloudflare login alone does not deploy the Worker or configure TURN. Missing production TURN configuration fails explicitly instead of silently falling back to direct-only connections. The Pages publication job also refuses a missing `VITE_SIGNAL_URL` so merging cannot silently publish a build with multiplayer disabled.

## Cost and scope

SQLite Durable Objects are available on the Workers Free plan, subject to daily limits. Cloudflare Realtime TURN includes 1,000 GB of monthly egress shared with SFU, then charges $0.05/GB. This is not an unlimited-free service. Account activation and billing requirements are controlled by Cloudflare; the repository does not change account plans.

The Worker accepts requests from the game’s origin, limits new connection requests per IP, reserves a separate random host token, permits one guest, and limits signaling size and rate. Origin checks are a browser boundary, not account authentication; monitor usage if sharing the game publicly. Host authority remains trusted, so this is a casual game between friends, not cheat-resistant dedicated-server hosting.

Sources: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Realtime pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/), [TURN credential generation](https://developers.cloudflare.com/realtime/turn/generate-credentials/).

## Local development

The existing `npm run dev` still runs the Node/LAN version. For the Cloudflare version, start two terminals:

```sh
npm run signal:dev
```

```sh
VITE_SIGNAL_URL=http://127.0.0.1:3190 npm run dev:peer -- --host 127.0.0.1 --port 3180
```

Open **http://127.0.0.1:3180/**. The `test` Worker environment deliberately uses no external relay; it is for local development only. Never deploy that environment for remote play. `.wrangler/`, `.dev.vars*` and `.env.*.local` are ignored by Git.

## Validation

```sh
npm run check
npm test
npm run test:browser
npm run test:pages
npx wrangler deploy --env="" --dry-run
```

The Pages suite builds the real `/zed-duel/` frontend and runs the Worker locally using Wrangler. It exercises actual WebRTC, a complete duel and rematch, both champions, manual codes, invite links, capacity rejection, host departure, guest replacement, unavailable rooms, blocked peer connections, retry/cancel, offline practice and project-path navigation. Browser tests need `npx playwright install chromium`, or an installed Chrome with `PLAYWRIGHT_CHANNEL=chrome`.

After deploying and configuring secrets, verify relay-only connectivity as well as normal connectivity. With Playwright, install an initialization script in both test contexts before loading the page that subclasses `RTCPeerConnection` and passes `iceTransportPolicy: 'relay'` to its constructor. Start a duel and inspect `getStats()` to confirm the selected candidate pair uses relay candidates. Then test an invite with two physical computers on different internet connections. Do not treat local tests or a successful Worker deploy as proof of live TURN connectivity.
