import { existsSync, mkdirSync, unlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changeEvent } from '@launchdeck/shared';
import type { AemClient } from '../src/aem/AemClient.ts';
import { MockAemClient } from '../src/aem/index.ts';
import { openDb } from '../src/db/index.ts';
import type { Db } from '../src/db/index.ts';
import { createFolderRepo } from '../src/repo/folders.ts';
import { createPoller } from '../src/watcher/poller.ts';
import { copyFixtures } from './fixtures.ts';
import { spyLog } from './helpers.ts';

const FALL = '/content/dam/brand/fall-launch';
const HOLIDAY = '/content/dam/brand/holiday-promo';

let root: string;
let cleanup: () => void;
let db: Db;
let client: MockAemClient;
let log: ReturnType<typeof spyLog>;

beforeEach(() => {
  ({ root, cleanup } = copyFixtures());
  db = openDb(':memory:');
  client = new MockAemClient({ rootDir: root });
  log = spyLog();
});
afterEach(() => {
  db.close();
  cleanup();
});

const fsPath = (jcr: string) => join(root, jcr);

const delegate = (c: AemClient): AemClient => ({
  listFolder: (p) => c.listFolder(p),
  listAllAssets: (p) => c.listAllAssets(p),
  queryChangedAssets: (p, s) => c.queryChangedAssets(p, s),
  queryAuditEvents: (p, s) => c.queryAuditEvents(p, s),
});

describe('pollFolder', () => {
  it('emits ADDED on first poll, then MODIFIED + DELETED, then nothing', async () => {
    const poller = createPoller({ db, client, log });
    const folders = createFolderRepo(db);

    const first = await poller.pollFolder(FALL);
    expect(first.ok).toBe(true);
    expect(first.events).toHaveLength(5);
    expect(first.events.every((e) => e.type === 'ADDED' && e.userSource === 'audit')).toBe(true);
    expect(first.events.every((e) => changeEvent.safeParse(e).success)).toBe(true);
    expect(first.events.find((e) => e.assetName === 'hero.jpg')).toMatchObject({
      user: 'maria.chen@agency',
      format: 'image/jpeg',
      folderPath: FALL,
    });
    expect(new Set(first.events.map((e) => e.id)).size).toBe(5);
    expect(folders.snapshot(FALL).map((s) => s.path)).toHaveLength(5);
    const row = folders.get(FALL);
    expect(row).toMatchObject({ audit_readable: 1, last_error: null });
    expect(row?.last_lower_bound).toBe(row?.last_success_at);
    expect(first.events[0]?.detectedAt).toBe(row?.last_success_at);

    const future = new Date(Date.now() + 60_000);
    utimesSync(fsPath(`${FALL}/hero.jpg`), future, future);
    unlinkSync(fsPath(`${FALL}/specs.pdf`));

    const second = await poller.pollFolder(FALL);
    expect(second.ok).toBe(true);
    expect(second.events.map((e) => [e.type, e.assetName, e.userSource])).toEqual([
      ['DELETED', 'specs.pdf', 'audit'],
      ['MODIFIED', 'hero.jpg', 'audit'],
    ]);
    expect(second.events.find((e) => e.type === 'MODIFIED')?.occurredAt).toBe(future.toISOString());

    const third = await poller.pollFolder(FALL);
    expect(third).toEqual({ folderPath: FALL, ok: true, events: [] });
    expect(folders.snapshot(FALL).map((s) => s.path)).not.toContain(`${FALL}/specs.pdf`);
    expect(folders.assetCount(FALL)).toBe(4);
    expect(db.prepare('SELECT COUNT(*) FROM change_events').pluck().get()).toBe(7);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('falls back to jcr users when the audit log is denied and warns once', async () => {
    const poller = createPoller({ db, client, log });
    const first = await poller.pollFolder(HOLIDAY);
    expect(first.ok).toBe(true);
    expect(first.events.map((e) => [e.assetName, e.user, e.userSource])).toEqual([
      ['gift-guide.jpg', 'sam.rivera', 'jcr'],
      ['promo.png', 'sam.rivera', 'jcr'],
    ]);
    const later = new Date(Date.now() + 60_000);
    utimesSync(fsPath(`${HOLIDAY}/promo.png`), later, later);
    const second = await poller.pollFolder(HOLIDAY);
    expect(second.events).toMatchObject([{ type: 'MODIFIED', userSource: 'jcr', user: 'sam.rivera' }]);
    await poller.pollFolder(HOLIDAY);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(createFolderRepo(db).health([HOLIDAY])[0]).toMatchObject({ auditReadable: false, assetCount: 2 });

    // A restart re-checks audit access once (so fixed permissions take effect) and warns again once.
    const restarted = createPoller({ db, client, log });
    await restarted.pollFolder(HOLIDAY);
    await restarted.pollFolder(HOLIDAY);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it('re-checks audit once per process, then skips it', async () => {
    await createPoller({ db, client, log }).pollFolder(HOLIDAY);
    let auditCalls = 0;
    const counting: AemClient = {
      ...delegate(client),
      queryAuditEvents: (p, s) => {
        auditCalls++;
        return client.queryAuditEvents(p, s);
      },
    };
    const restarted = createPoller({ db, client: counting, log });
    await restarted.pollFolder(HOLIDAY);
    await restarted.pollFolder(HOLIDAY);
    expect(auditCalls).toBe(1);
  });

  it('records errors without touching the snapshot and recovers', async () => {
    const missing = '/content/dam/brand/not-yet';
    const poller = createPoller({ db, client, log });
    const failed = await poller.pollFolder(missing);
    expect(failed).toMatchObject({ folderPath: missing, ok: false, events: [] });
    expect(failed.error).toContain('Folder not found');
    await poller.pollFolder(missing);
    expect(log.warn).toHaveBeenCalledTimes(1);

    const row = createFolderRepo(db).get(missing);
    expect(row).toMatchObject({ last_success_at: null, last_lower_bound: null });
    expect(row?.last_error).toContain('Folder not found');
    expect(row?.last_error_at).not.toBeNull();
    expect(row?.last_poll_at).not.toBeNull();

    mkdirSync(fsPath(missing));
    expect(existsSync(fsPath(missing))).toBe(true);
    const ok = await poller.pollFolder(missing);
    expect(ok).toEqual({ folderPath: missing, ok: true, events: [] });
    const health = createFolderRepo(db).health([missing])[0];
    expect(health?.lastError).toContain('Folder not found');
    expect(Date.parse(health!.lastSuccessAt!)).toBeGreaterThanOrEqual(Date.parse(health!.lastErrorAt!));
    expect(health?.assetCount).toBe(0);
  });

  it('keeps the snapshot and lower bound when a later poll fails', async () => {
    const poller = createPoller({ db, client, log });
    await poller.pollFolder(FALL);
    const before = createFolderRepo(db).get(FALL);
    const broken: AemClient = {
      ...delegate(client),
      listAllAssets: async () => Promise.reject(new Error('x'.repeat(900))),
    };
    const res = await createPoller({ db, client: broken, log }).pollFolder(FALL);
    expect(res.ok).toBe(false);
    expect(res.error).toHaveLength(500);
    const after = createFolderRepo(db).get(FALL);
    expect(after?.last_lower_bound).toBe(before?.last_lower_bound);
    expect(after?.last_error).toHaveLength(500);
    expect(createFolderRepo(db).assetCount(FALL)).toBe(5);
  });

  it('falls back for one poll on other audit errors', async () => {
    const flaky: AemClient = {
      ...delegate(client),
      queryAuditEvents: async () => Promise.reject(new Error('503 upstream')),
    };
    const res = await createPoller({ db, client: flaky, log }).pollFolder(FALL);
    expect(res.ok).toBe(true);
    expect(res.events.every((e) => e.userSource === 'jcr')).toBe(true);
    expect(createFolderRepo(db).get(FALL)?.audit_readable).toBeNull();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});
