import type { ChangeEvent, WatcherHealth } from '@launchdeck/shared';
import { addSeconds, isoNow } from '../clock.ts';
import type { Db } from '../db/index.ts';
import { createFolderRepo } from '../repo/folders.ts';
import type { Bus } from './bus.ts';
import type { PollResult, Poller } from './poller.ts';
import { DEFAULT_CONCURRENCY, Semaphore } from './semaphore.ts';
import type { WatcherLog } from './types.ts';

export interface SchedulerDeps {
  db: Db;
  poller: Pick<Poller, 'pollFolder'>;
  bus: Bus;
  log: WatcherLog;
  intervalSec: number;
  now?: () => string;
  concurrency?: number;
}

export type Scheduler = ReturnType<typeof createScheduler>;

const noop = () => undefined;

/**
 * Runs poll batches strictly one after another (a pollNow during a tick is queued behind it),
 * so the same folder is never polled concurrently. Within a batch, folders share a semaphore.
 */
export function createScheduler({
  db,
  poller,
  bus,
  log,
  intervalSec,
  now = isoNow,
  concurrency = DEFAULT_CONCURRENCY,
}: SchedulerDeps) {
  const folders = createFolderRepo(db);
  const semaphore = new Semaphore(concurrency);
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let lastTickAt: string | null = null;
  let nextTickAt: string | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  let pending = 0;

  function health(): WatcherHealth {
    return { intervalSec, lastTickAt, nextTickAt, folders: folders.health(folders.boundPaths()) };
  }

  function publish(results: PollResult[]): void {
    const events: ChangeEvent[] = results.flatMap((r) => r.events);
    if (events.length) {
      const affected = [...new Set(events.map((e) => e.folderPath))];
      bus.publish({ type: 'change', events, campaignIds: folders.campaignIdsFor(affected) });
    }
    bus.publish({ type: 'health', health: health() });
  }

  async function runBatch(paths: readonly string[] | undefined): Promise<PollResult[]> {
    if (stopped) return [];
    const targets = [...new Set(paths ?? folders.boundPaths())];
    const results = await Promise.all(targets.map((p) => semaphore.run(() => poller.pollFolder(p))));
    if (stopped) return results;
    lastTickAt = now();
    publish(results);
    return results;
  }

  function enqueue(paths?: readonly string[]): Promise<PollResult[]> {
    pending++;
    const run = chain
      .then(() => runBatch(paths))
      .catch((err: unknown) => {
        log.error({ error: err instanceof Error ? err.message : String(err) }, 'Watcher batch failed');
        return [];
      })
      .finally(() => {
        pending--;
      });
    chain = run.then(noop, noop);
    return run;
  }

  function tick(): void {
    nextTickAt = addSeconds(now(), intervalSec);
    if (pending > 0) {
      log.debug({}, 'Watcher tick skipped: previous poll still running');
      return;
    }
    void enqueue();
  }

  return {
    health,
    get running(): boolean {
      return pending > 0;
    },
    start(): void {
      if (timer || stopped) return;
      timer = setInterval(tick, intervalSec * 1000);
      timer.unref();
      tick();
    },
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      nextTickAt = null;
      await chain;
    },
    /** Poll now (all bound folders when omitted). Queued behind any running batch. */
    pollNow(paths?: readonly string[]): Promise<PollResult[]> {
      return stopped ? Promise.resolve([]) : enqueue(paths);
    },
  };
}
