import type { IceServer, PeerSignal } from '../../shared/signaling';

interface PeerEvents {
  open: () => void;
  data: (value: unknown) => void;
  close: () => void;
  signal: (signal: PeerSignal) => void;
}

export class RtcPeer {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private closed = false;
  private candidates: RTCIceCandidateInit[] = [];
  private queue = Promise.resolve();
  private timeout = 0;
  private disconnectTimeout = 0;

  constructor(
    servers: IceServer[],
    private events: PeerEvents,
  ) {
    this.pc = new RTCPeerConnection({ iceServers: servers });
    this.timeout = window.setTimeout(() => this.fail(), 25_000);
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate && !this.closed)
        this.events.signal({ candidate: candidate.toJSON() as RTCIceCandidateInit & { candidate: string } });
    };
    this.pc.onconnectionstatechange = () => {
      window.clearTimeout(this.disconnectTimeout);
      if (this.pc.connectionState === 'failed') this.fail();
      else if (this.pc.connectionState === 'disconnected')
        this.disconnectTimeout = window.setTimeout(() => this.fail(), 5000);
    };
    this.pc.ondatachannel = ({ channel }) => this.attach(channel);
  }

  get open() {
    return this.channel?.readyState === 'open';
  }

  offer() {
    this.attach(this.pc.createDataChannel('duel', { ordered: true }));
    this.enqueue(async () => {
      await this.pc.setLocalDescription(await this.pc.createOffer());
      if (!this.closed)
        this.events.signal({ description: { type: 'offer', sdp: this.pc.localDescription!.sdp } });
    });
  }

  receive(signal: PeerSignal) {
    this.enqueue(async () => {
      if ('description' in signal) {
        await this.pc.setRemoteDescription(signal.description);
        for (const candidate of this.candidates) await this.pc.addIceCandidate(candidate);
        this.candidates = [];
        if (signal.description.type === 'offer') {
          await this.pc.setLocalDescription(await this.pc.createAnswer());
          if (!this.closed)
            this.events.signal({ description: { type: 'answer', sdp: this.pc.localDescription!.sdp } });
        }
      } else if (this.pc.remoteDescription) await this.pc.addIceCandidate(signal.candidate);
      else this.candidates.push(signal.candidate);
    });
  }

  send(message: unknown, snapshot = false) {
    if (!this.open || (snapshot && this.channel!.bufferedAmount >= 256_000)) return;
    try {
      this.channel!.send(JSON.stringify(message));
    } catch {
      this.fail();
    }
  }

  close() {
    this.closed = true;
    window.clearTimeout(this.timeout);
    window.clearTimeout(this.disconnectTimeout);
    this.channel?.close();
    this.pc.close();
  }

  private attach(channel: RTCDataChannel) {
    if (this.channel || channel.label !== 'duel') {
      channel.close();
      return;
    }
    this.channel = channel;
    channel.onopen = () => {
      if (this.closed) return;
      window.clearTimeout(this.timeout);
      this.events.open();
    };
    channel.onmessage = ({ data }) => {
      if (this.closed || typeof data !== 'string' || data.length > 262_144) return;
      let value;
      try {
        value = JSON.parse(data);
      } catch {
        return;
      }
      this.events.data(value);
    };
    channel.onclose = () => this.fail();
    channel.onerror = () => this.fail();
  }
  private enqueue(action: () => Promise<void>) {
    this.queue = this.queue.then(() => (this.closed ? undefined : action())).catch(() => this.fail());
  }
  private fail() {
    if (this.closed) return;
    this.close();
    this.events.close();
  }
}
