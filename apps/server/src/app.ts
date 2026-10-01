import Fastify from 'fastify';
import type { FastifyServerOptions } from 'fastify';
import type { AemClient } from './aem/AemClient.ts';
import { createAemClient } from './aem/index.ts';
import type { AemEnv } from './aem/index.ts';
import { isoNow } from './clock.ts';
import { openDb } from './db/index.ts';
import type { Db } from './db/index.ts';
import { loadEnv } from './env.ts';
import { createCampaignRepo } from './repo/campaigns.ts';
import { createCampaignViews } from './repo/campaignViews.ts';
import { createEventRepo } from './repo/events.ts';
import { createFolderRepo } from './repo/folders.ts';
import { campaignRoutes } from './routes/campaigns.ts';
import { eventRoutes } from './routes/events.ts';
import { folderRoutes } from './routes/folders.ts';
import { streamRoutes } from './routes/stream.ts';
import { watcherRoutes } from './routes/watcher.ts';
import { Bus } from './watcher/bus.ts';
import { createPoller } from './watcher/poller.ts';
import { createScheduler } from './watcher/scheduler.ts';
import type { Scheduler } from './watcher/scheduler.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    bus: Bus;
    scheduler: Scheduler;
    aem: AemClient;
  }
}

export const DEFAULT_INTERVAL_SEC = 60;

export interface BuildAppOptions {
  dbPath: string;
  logger?: boolean | { level?: string };
  now?: () => string;
  /** Injected client (tests). Otherwise created once from `env` (or loadEnv()). */
  aemClient?: AemClient;
  env?: AemEnv;
  intervalSec?: number;
  /** Start the interval watcher when the app is ready. Tests drive `app.scheduler.pollNow` instead. */
  startScheduler?: boolean;
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
  const app = Fastify({ logger: loggerOptions(opts.logger), forceCloseConnections: true });
  const now = opts.now ?? isoNow;
  const db = openDb(opts.dbPath);
  const aem =
    opts.aemClient ?? createAemClient(opts.env ?? loadEnv(), app.log);

  const bus = new Bus();
  const poller = createPoller({ db, client: aem, log: app.log, now });
  const scheduler = createScheduler({
    db,
    poller,
    bus,
    log: app.log,
    now,
    intervalSec: opts.intervalSec ?? DEFAULT_INTERVAL_SEC,
  });

  app.decorate('db', db);
  app.decorate('bus', bus);
  app.decorate('scheduler', scheduler);
  app.decorate('aem', aem);
  app.addHook('onClose', async () => {
    await scheduler.stop();
    db.close();
  });
  if (opts.startScheduler) {
    app.addHook('onReady', async () => {
      scheduler.start();
    });
  }

  const campaigns = createCampaignRepo(db, { now });
  const events = createEventRepo(db);
  const toView = createCampaignViews({ folders: createFolderRepo(db), events, now });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(campaignRoutes, { prefix: '/api', repo: campaigns, toView, bus, scheduler });
  await app.register(eventRoutes, { prefix: '/api', campaigns, events });
  await app.register(folderRoutes, { prefix: '/api', client: aem });
  await app.register(watcherRoutes, { prefix: '/api', scheduler });
  await app.register(streamRoutes, { prefix: '/api', bus, scheduler });

  return app;
}
