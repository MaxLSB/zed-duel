import { PeerServer } from 'peer';
import { preview } from 'vite';

PeerServer({ host: '127.0.0.1', port: 3190, path: '/peer' });
await preview({ base: '/zed-duel/', preview: { host: '127.0.0.1', port: 3180, strictPort: true } });
