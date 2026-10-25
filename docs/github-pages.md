# GitHub Pages and browser-hosted duels

After deployment, the game will be available at **https://maxlsb.github.io/zed-duel/**. This is the `zed-duel` repository's project site. The workflow does not touch `MaxLSB.github.io`, create a `CNAME`, or deploy to the portfolio's root.

## One-time setup

1. Make **MaxLSB/zed-duel** public if using GitHub Free.
2. In **zed-duel → Settings → Pages**, set **Source** to **GitHub Actions**.
3. Merge the deployment PR into `main`. The **Test and deploy game to Pages** workflow tests the game, builds `dist/` and publishes this repository's Pages artifact. PRs run checks only; they never publish.
4. Open the project URL, choose **Create a duel**, and send **Copy invite** to your friend. Your friend can also open the page and enter the six-character room code. Both click **Ready to duel**.

No Node game server or paid hosting account is needed for this mode. Keep the host tab and computer open during the match. Closing the host ends the room; guests can leave and rejoin an existing host, but an interrupted duel resets. Solo practice runs locally and does not contact the connection service.

## How it works

The host runs the same combat simulation in a Web Worker at 60 Hz and sends state at 20 Hz over a WebRTC data channel. The guest sends inputs to the host. Room capacity, ready state, cooldowns, damage and rematches are resolved by the host. As with other player-hosted games, the host is trusted and has a latency advantage; this is not cheat-resistant dedicated-server hosting.

PeerJS's free cloud PeerServer handles signaling: it helps browsers establish the connection. The pinned PeerJS client supplies public STUN and TURN defaults; TURN can relay traffic on networks that cannot connect directly. These third-party services must be reachable, and their free availability is not guaranteed. The page reports failed connections and lets players retry. Some corporate networks and VPNs can still prevent WebRTC connections.

Sources: [GitHub project sites](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [PeerJS connection setup](https://peerjs.com/client/getting-started), [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections).

## Local preview

```sh
npm ci
npm run dev:peer
```

For the exact production path:

```sh
npm run build:pages
npx vite preview --base=/zed-duel/
```

Open the printed address with `/zed-duel/` appended. The existing `npm run dev` command still runs the Node-hosted LAN version. `npm start` continues to serve a regular `npm run build` build from the Node server.

## Optional connection-service configuration

The defaults need no repository secrets or variables. To use your own PeerServer, set the repository Actions variable **VITE_PEER_SERVER_URL** to its public HTTPS URL, including its path, such as `https://signal.example.com/peer`. It must support PeerJS's default `peerjs` key.

**VITE_ICE_SERVERS** optionally replaces the client's ICE configuration with a JSON array of `RTCIceServer` entries. Only use credentials intended for distribution to browsers: every `VITE_` value is public in the compiled frontend. Private or permanent TURN credentials must not be put into the repository or Pages build; use a separately managed short-lived credential mechanism if your provider requires one.

For local overrides use `.env.pages.local` (ignored by Git). Rebuild/re-run the Pages workflow after changing repository variables. The test suite uses its own local PeerServer and no external STUN/TURN so CI does not depend on the free public service.

## Validation

```sh
npm test
npm run test:browser
npm run test:pages
```

The Pages suite builds real static files under `/zed-duel/`, then exercises two browser contexts over actual WebRTC, a complete duel and rematch, a full-room rejection, host departure, unavailable rooms, offline practice and project-path navigation. Browser tests require `npx playwright install chromium`, or an installed Chrome with `PLAYWRIGHT_CHANNEL=chrome`.

Passing local tests does not establish connectivity between every pair of remote networks. After publishing, test the invite with your friend on a separate internet connection.
