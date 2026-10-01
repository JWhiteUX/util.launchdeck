import { loadEnv } from './env.ts';
import { buildApp } from './app.ts';

const env = loadEnv();
const app = await buildApp({ dbPath: env.DB_PATH, logger: true });

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error(err, 'shutdown failed');
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: '127.0.0.1', port: env.PORT });
} catch (err) {
  app.log.error(err);
  await app.close();
  process.exit(1);
}
