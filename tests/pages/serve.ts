import { preview } from 'vite';

await preview({ base: '/zed-duel/', preview: { host: '127.0.0.1', port: 3180, strictPort: true } });
