import { DurableObject } from 'cloudflare:workers';
import { MAX_RELAY_LENGTH, RELAY_VERSION, validRelayData, type SignalMessage } from '../src/shared/signaling';

interface Member {
  player: 0 | 1;
  id: string;
  pendingStates: number;
  at: number;
  count: number;
  closed?: boolean;
}

export class SignalRoom extends DurableObject<unknown> {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      if (await this.ctx.storage.get('hostToken')) return new Response(null, { status: 409 });
      const token = crypto.randomUUID();
      await this.ctx.storage.put('hostToken', token);
      await this.ctx.storage.setAlarm(Date.now() + 120_000);
      return Response.json({ token });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response(null, { status: 426 });
    const expected = await this.ctx.storage.get<string>('hostToken');
    const supplied = new URL(request.url).searchParams.get('host');
    const host = this.members().find((ws) => this.member(ws).player === 0);
    const guest = this.members().find((ws) => this.member(ws).player === 1);
    const player = supplied ? 0 : 1;
    let error = '';
    if (new URL(request.url).searchParams.get('v') !== String(RELAY_VERSION))
      error = 'The game has been updated. Reload both players, then create a new room.';
    else if (!expected || (player === 1 && !host))
      error = 'Room not found. Check the code and keep the host tab open.';
    else if (player === 0 && supplied !== expected) error = 'This invite cannot host the room.';
    else if ((player === 0 && host) || (player === 1 && guest)) error = 'This room already has two players.';
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      player,
      id: crypto.randomUUID(),
      pendingStates: 0,
      at: Date.now(),
      count: 0,
      closed: !!error,
    } satisfies Member);
    if (error) {
      this.send(server, { type: 'error', message: error });
      server.close(1008, 'Room unavailable');
    } else {
      this.send(server, { type: 'welcome', player, version: RELAY_VERSION });
      if (player === 0) await this.ctx.storage.setAlarm(Date.now() + 14_400_000);
      else {
        const session = this.member(server).id;
        this.send(server, { type: 'peer', session });
        this.send(host!, { type: 'peer', session });
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const member = this.member(ws);
    if (member.closed) return;
    if (typeof raw !== 'string' || raw.length > (member.player === 0 ? MAX_RELAY_LENGTH : 4096))
      return this.remove(ws, 1008);
    if (Date.now() - member.at >= 1000) {
      member.at = Date.now();
      member.count = 0;
    }
    if (++member.count > 150) return this.remove(ws, 1008);
    ws.serializeAttachment(member);
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return this.remove(ws, 1008);
    }
    const guest = this.members().find((peer) => this.member(peer).player === 1);
    if (!guest || message?.session !== this.member(guest).id) return;
    if (message.type === 'ack' && member.player === 1) {
      member.pendingStates = Math.max(0, member.pendingStates - 1);
      ws.serializeAttachment(member);
      return;
    }
    if (message.type !== 'relay' || !validRelayData(member.player, message.data)) return;
    const target = this.members().find((peer) => this.member(peer).player !== member.player);
    if (!target) return;
    if (member.player === 0 && message.data.type === 'state') {
      const recipient = this.member(target);
      if (recipient.pendingStates >= 3) return;
      recipient.pendingStates++;
      target.serializeAttachment(recipient);
    }
    this.send(target, { type: 'relay', session: message.session, from: member.player, data: message.data });
  }

  webSocketClose(ws: WebSocket) {
    this.remove(ws, 1000);
  }
  webSocketError(ws: WebSocket) {
    this.remove(ws, 1011);
  }

  async alarm() {
    for (const ws of this.members()) {
      this.send(ws, { type: 'error', message: 'Room expired. Create a new duel.' });
      ws.close(1000, 'Room expired');
    }
    await this.ctx.storage.deleteAll();
  }

  private member(ws: WebSocket): Member {
    return ws.deserializeAttachment();
  }
  private members() {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === WebSocket.OPEN && !this.member(ws).closed);
  }
  private send(ws: WebSocket, message: SignalMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      this.remove(ws, 1011);
    }
  }
  private remove(ws: WebSocket, code: number) {
    const member = this.member(ws);
    if (member.closed) return;
    member.closed = true;
    ws.serializeAttachment(member);
    try {
      ws.close(code, 'Disconnected');
    } catch {}
    if (member.player === 0) {
      for (const peer of this.members()) {
        this.send(peer, { type: 'error', message: 'The host disconnected. Join a new duel to play again.' });
        try {
          peer.close(1000, 'Host left');
        } catch {}
      }
      this.ctx.waitUntil(Promise.all([this.ctx.storage.deleteAll(), this.ctx.storage.deleteAlarm()]));
    } else {
      for (const peer of this.members())
        if (this.member(peer).player === 0) this.send(peer, { type: 'peer-left', session: member.id });
    }
  }
}
