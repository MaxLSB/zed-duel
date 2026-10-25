export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type PeerSignal =
  | { description: { type: 'offer' | 'answer'; sdp: string } }
  | { candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

export type SignalMessage =
  | { type: 'welcome'; player: 0 | 1 }
  | { type: 'ice'; servers: IceServer[] }
  | { type: 'peer'; session: string }
  | { type: 'peer-left'; session: string }
  | { type: 'signal'; session: string; signal: PeerSignal }
  | { type: 'error'; message: string };
