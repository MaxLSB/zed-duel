import { networkInterfaces } from 'node:os';
import { createApplication } from './app';

const port = Number(process.env.PORT ?? 3000);
const app = await createApplication(!process.argv.includes('--production'));
app.server.listen(port, '0.0.0.0', () => {
  console.log(`Zed Duel → http://localhost:${port}`);
  for (const entries of Object.values(networkInterfaces()))
    for (const address of entries ?? []) {
      if (address.family === 'IPv4' && !address.internal)
        console.log(`LAN      → http://${address.address}:${port}`);
    }
});
app.server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
