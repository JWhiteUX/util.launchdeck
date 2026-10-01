import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent, StreamMessage } from '@launchdeck/shared';
import { openDb } from '../src/db/index.ts';
import type { Db } from '../src/db/index.ts';
import { createCampaignRepo } from '../src/repo/campaigns.ts';
import { Bus } from '../src/watcher/bus.ts';
import type { PollResult } from '../src/watcher/poller.ts';
import { createScheduler } from '../src/watcher/scheduler.ts';
import { Semaphore } from '../src/watcher/semaphore.ts';
import { spyLog, validInput } from './helpers.ts';

const A = '/content/dam/brand/a';
const B = '/content/dam/brand/b';
const C = '/content/dam/brand/c';

const event = (folderPath: string, id: number): ChangeEvent => ({
  id,
  folderPath,
  assetPath: `${folderPath}/x.jpg`,
  assetName: 'x.jpg',
  type: 'ADDED',
  format: 'image/jpeg',
  user: 'u',
  userSource: 'jcr',
  occurredAt: '2026-09-30T00:00:00.000Z',
  detectedAt: '2026-09-30T00:00:00.000Z',
});

/** Poller whose polls stay open until released; records concurrency per folder. */
function fakePoller(eventsFor: (path: string) => ChangeEvent[] = () => []) {
  const pending: (() => void)[] = [];
  const calls: string[] = [];
  const active = new Map<string, number>();
  let overlaps = 0;
  let maxConcurrent = 0;
  let current = 0;
  return {
    calls,
    pending,
    get overlaps() {
      return overlaps;
    },
    get maxConcurrent() {
      return maxConcurrent;
    },
    releaseAll() {
      for (const r of pending.splice(0)) r();
    },
    pollFolder(path: string): Promise<PollResult> {
      calls.push(path);
      const n = (active.get(path) ?? 0) + 1;
      if (n > 1) overlaps++;
      active.set(path, n);
      maxConcurrent = Math.max(maxConcurrent, ++current);
      return new Promise((resolve) => {
        pending.push(() => {
          active.set(path, (active.get(path) ?? 1) - 1);
          current--;
          resolve({ folderPath: path, ok: true, events: eventsFor(path) });
        });
      });
    },
  };
}

let db: Db;
let bus: Bus;
let messages: StreamMessage[];
let log: ReturnType<typeof spyLog>;
let ids: string[];

beforeEach(() => {
  db = openDb(':memory:');
  const repo = createCampaignRepo(db);
  ids = [
    repo.create({ ...validInput, folders: [A, B] }).id,
    repo.create({ ...validInput, name: 'Other', folders: [B, C] }).id,
  ];
  bus = new Bus();
  messages = [];
  bus.subscribe((m) => messages.push(m));
  log = spyLog();
});
afterEach(() => {
  vi.useRealTimers();
  db.close();
});

const flush = () => new Promise((r) => setImmediate(r));

describe('scheduler', () => {
  it('pollNow polls distinct bound folders and publishes change + health', async () => {
    const poller = fakePoller((p) => (p === A ? [event(A, 1)] : []));
    const s = createScheduler({ db, poller, bus, log, intervalSec: 60 });
    const run = s.pollNow();
    await flush();
    expect([...poller.calls].sort()).toEqual([A, B, C]);
    poller.releaseAll();
    const results = await run;
    expect(results.map((r) => r.folderPath).sort()).toEqual([A, B, C]);
    expect(messages.map((m) => m.type)).toEqual(['change', 'health']);
    const change = messages[0];
    expect(change?.type === 'change' && change.campaignIds).toEqual([ids[0]]);
    expect(change?.type === 'change' && change.events).toHaveLength(1);
    const health = s.health();
    expect(health.lastTickAt).not.toBeNull();
    expect(health.folders.map((f) => f.folderPath)).toEqual([A, B, C]);
  });

  it('publishes only health when nothing changed', async () => {
    const poller = fakePoller();
    const s = createScheduler({ db, poller, bus, log, intervalSec: 60 });
    const run = s.pollNow([C]);
    await flush();
    poller.releaseAll();
    await run;
    expect(poller.calls).toEqual([C]);
    expect(messages.map((m) => m.type)).toEqual(['health']);
  });

  it('caps concurrent folder polls at 4', async () => {
    const poller = fakePoller();
    const s = createScheduler({ db, poller, bus, log, intervalSec: 60 });
    const paths = Array.from({ length: 9 }, (_, i) => `/content/dam/f${i}`);
    const run = s.pollNow(paths);
    while (poller.calls.length < paths.length) {
      await flush();
      expect(poller.pending.length).toBeLessThanOrEqual(4);
      poller.releaseAll();
    }
    await run;
    expect(poller.maxConcurrent).toBe(4);
  });

  it('skips ticks while a batch is running and queues pollNow without overlap', async () => {
    vi.useFakeTimers();
    const poller = fakePoller();
    const s = createScheduler({ db, poller, bus, log, intervalSec: 10 });
    s.start();
    expect(s.health().nextTickAt).not.toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.calls).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(25_000);
    expect(poller.calls).toHaveLength(3);
    expect(log.debug).toHaveBeenCalledTimes(2);

    const queued = s.pollNow([A]);
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.calls).toHaveLength(3);

    poller.releaseAll();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.calls).toHaveLength(4);
    poller.releaseAll();
    await queued;
    expect(poller.overlaps).toBe(0);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(poller.calls).toHaveLength(7);
    poller.releaseAll();
    await vi.advanceTimersByTimeAsync(0);

    await s.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(s.health().nextTickAt).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poller.calls).toHaveLength(7);
    expect(await s.pollNow()).toEqual([]);
  });

  it('stop waits for the running batch', async () => {
    const poller = fakePoller();
    const s = createScheduler({ db, poller, bus, log, intervalSec: 60 });
    void s.pollNow([A]);
    await flush();
    let stopped = false;
    const stopping = s.stop().then(() => {
      stopped = true;
    });
    await flush();
    expect(stopped).toBe(false);
    poller.releaseAll();
    await stopping;
    expect(stopped).toBe(true);
  });
});

describe('Semaphore', () => {
  it('runs at most `limit` tasks and propagates results and errors', async () => {
    const sem = new Semaphore(2);
    let running = 0;
    let peak = 0;
    const task = (v: number) =>
      sem.run(async () => {
        peak = Math.max(peak, ++running);
        await flush();
        running--;
        if (v < 0) throw new Error('boom');
        return v;
      });
    const results = await Promise.allSettled([task(1), task(2), task(-1), task(4), task(5)]);
    expect(peak).toBe(2);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : 'err'))).toEqual([1, 2, 'err', 4, 5]);
    expect(sem.inFlight).toBe(0);
  });
});

describe('Bus', () => {
  it('delivers to subscribers, isolates throwing ones and unsubscribes', () => {
    const b = new Bus();
    const got: string[] = [];
    b.subscribe(() => {
      throw new Error('bad subscriber');
    });
    const off = b.subscribe((m) => got.push(m.type));
    b.publish({ type: 'campaign', action: 'deleted', id: 'x' });
    off();
    b.publish({ type: 'campaign', action: 'deleted', id: 'y' });
    expect(got).toEqual(['campaign']);
    expect(b.subscriberCount).toBe(1);
  });
});
