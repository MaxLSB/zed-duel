import { PeerConnection } from './peer/connection';
import { SocketConnection } from './socket-connection';

export const Connection = import.meta.env.VITE_MULTIPLAYER === 'peer' ? PeerConnection : SocketConnection;
