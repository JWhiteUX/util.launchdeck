import Fastify from 'fastify';
import type { FastifyServerOptions } from 'fastify';
import { openDb } from './db/index.ts';
import type { Db } from './db/index.ts';
import { createCampaignRepo } from './repo/campaigns.ts';
import { campaignRoutes } from './routes/campaigns.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export interface BuildAppOptions {
  dbPath: string;
  logger?: boolean | { level?: string };
  now?: () => string;
}

export const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.token',
  '*.accessToken',
  '*.access_token',
  '*.password',
  '*.secret',
  '*.clientSecret',
  '*.client_secret',
];

function loggerOptions(logger: BuildAppOptions['logger']): FastifyServerOptions['logger'] {
  if (!logger) return false;
  const level = typeof logger === 'object' ? logger.level : undefined;
  return { level: level ?? 'info', redact: { paths: redactPaths, censor: '[redacted]' } };
}

export async function buildApp(opts: BuildAppOptions) {
  const app = Fastify({ logger: loggerOptions(opts.logger) });
  const db = openDb(opts.dbPath);
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    db.close();
  });

  const repo = createCampaignRepo(db, opts.now ? { now: opts.now } : {});

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(campaignRoutes, { prefix: '/api', repo });

  return app;
}
