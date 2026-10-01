import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { CampaignInput, CampaignView, ChangeEvent, StreamMessage, WatcherHealth } from '@launchdeck/shared';
import { MockAemClient } from '../src/aem/index.ts';
import { buildApp } from '../src/app.ts';
import { copyFixtures } from './fixtures.ts';
import { dateFromToday, validInput } from './helpers.ts';

const FALL = '/content/dam/brand/fall-launch';
const HOLIDAY = '/content/dam/brand/holiday-promo';
const EMPTY = '/content/dam/brand/empty-soon';

let root: string;
let cleanup: () => void;
let app: FastifyInstance;
let messages: StreamMessage[];

beforeEach(async () => {
  ({ root, cleanup } = copyFixtures());
  app = await buildApp({ dbPath: ':memory:', aemClient: new MockAemClient({ rootDir: root }) });
  messages = [];
  app.bus.subscribe((m) => messages.push(m));
});
afterEach(async () => {
  await app.close();
  cleanup();
});

async function createCampaign(input: Partial<CampaignInput>): Promise<CampaignView> {
  const res = await app.inject({ method: 'POST', url: '/api/campaigns', payload: { ...validInput, ...input } });
  expect(res.statusCode).toBe(201);
  const c = res.json<CampaignView>();
  await app.scheduler.pollNow(c.folders);
  return c;
}

const getCampaign = async (id: string) =>
  (await app.inject({ method: 'GET', url: `/api/campaigns/${id}` })).json<CampaignView>();

describe('badges', () => {
  it('goes red on watcher error and recovers once the folder exists', async () => {
    const missing = '/content/dam/brand/not-yet';
    const c = await createCampaign({ folders: [missing], launchDate: dateFromToday(40) });
    expect(await getCampaign(c.id)).toMatchObject({ badge: 'red', badgeReason: 'watcher_error' });

    mkdirSync(join(root, missing));
    await app.scheduler.pollNow([missing]);
    const after = await getCampaign(c.id);
    expect(after.badgeReason).not.toBe('watcher_error');
    expect(after.badge).toBe('green');
    const health = app.scheduler.health().folders.find((f) => f.folderPath === missing);
    expect(health?.lastError).toContain('Folder not found');
  });

  it('is red for an empty folder within 7 days of launch', async () => {
    const c = await createCampaign({ folders: [EMPTY], startDate: dateFromToday(-5), launchDate: dateFromToday(3) });
    expect(await getCampaign(c.id)).toMatchObject({ badge: 'red', badgeReason: 'empty_near_launch' });
  });

  it('is amber with unreviewed events until reviewed', async () => {
    const c = await createCampaign({ folders: [FALL], startDate: dateFromToday(0), launchDate: dateFromToday(30) });
    expect(await getCampaign(c.id)).toMatchObject({ badge: 'amber', badgeReason: 'unreviewed', unreviewedCount: 5 });
    const res = await app.inject({ method: 'POST', url: `/api/campaigns/${c.id}/review` });
    expect(res.json<CampaignView>()).toMatchObject({ badge: 'green', badgeReason: 'ok', unreviewedCount: 0 });
    expect(messages.filter((m) => m.type === 'campaign').map((m) => m.type === 'campaign' && m.action)).toEqual([
      'created',
      'reviewed',
    ]);
  });
});

describe('campaign messages', () => {
  it('publishes created/updated/deleted and polls after create and update', async () => {
    const created = await createCampaign({ folders: [FALL] });
    expect(messages.map((m) => m.type)).toEqual(['campaign', 'change', 'health', 'health']);
    const change = messages[1];
    expect(change?.type === 'change' && change.campaignIds).toEqual([created.id]);

    messages.length = 0;
    const put = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${created.id}`,
      payload: { ...validInput, folders: [FALL, HOLIDAY] },
    });
    expect(put.statusCode).toBe(200);
    await app.scheduler.pollNow([]);
    expect(messages.map((m) => m.type)).toEqual(['campaign', 'change', 'health', 'health']);
    const changed = messages[1];
    expect(changed?.type === 'change' && changed.events.map((e) => e.folderPath)).toEqual([HOLIDAY, HOLIDAY]);

    messages.length = 0;
    await app.inject({ method: 'DELETE', url: `/api/campaigns/${created.id}` });
    expect(messages).toEqual([{ type: 'campaign', action: 'deleted', id: created.id }]);
  });
});

describe('events routes', () => {
  it('lists newest first with user and format filters, and facets', async () => {
    const c = await createCampaign({ folders: [FALL, HOLIDAY] });
    const all = (await app.inject({ method: 'GET', url: `/api/campaigns/${c.id}/events` })).json<ChangeEvent[]>();
    expect(all).toHaveLength(7);
    const sorted = [...all].sort((a, b) => (a.detectedAt === b.detectedAt ? b.id - a.id : a.detectedAt < b.detectedAt ? 1 : -1));
    expect(all).toEqual(sorted);

    const byUser = await app.inject({ method: 'GET', url: `/api/campaigns/${c.id}/events?user=sam.rivera` });
    expect(byUser.json<ChangeEvent[]>().map((e) => e.assetName).sort()).toEqual(['gift-guide.jpg', 'promo.png']);

    const byFormat = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${c.id}/events?format=${encodeURIComponent('image/png')}`,
    });
    expect(byFormat.json<ChangeEvent[]>().map((e) => e.assetName).sort()).toEqual([
      'banner.png',
      'post-1.png',
      'promo.png',
    ]);

    const both = await app.inject({ method: 'GET', url: `/api/campaigns/${c.id}/events?user=sam.rivera&format=image/jpeg` });
    expect(both.json<ChangeEvent[]>().map((e) => e.assetName)).toEqual(['gift-guide.jpg']);

    const facets = await app.inject({ method: 'GET', url: `/api/campaigns/${c.id}/events/facets` });
    expect(facets.json()).toEqual({
      users: ['dev.patel@agency', 'maria.chen@agency', 'sam.rivera', 'sam.rivera@agency'],
      formats: ['application/pdf', 'image/jpeg', 'image/png', 'video/mp4'],
    });
  });

  it('scopes events to the campaign folders and 404s unknown campaigns', async () => {
    await createCampaign({ folders: [FALL] });
    const other = await createCampaign({ folders: [HOLIDAY] });
    const events = (await app.inject({ method: 'GET', url: `/api/campaigns/${other.id}/events` })).json<ChangeEvent[]>();
    expect(events.every((e) => e.folderPath === HOLIDAY)).toBe(true);
    for (const url of ['/api/campaigns/nope/events', '/api/campaigns/nope/events/facets']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
    }
  });
});

describe('folders route', () => {
  it('lists the DAM root by default and a given path', async () => {
    const dam = await app.inject({ method: 'GET', url: '/api/folders' });
    expect(dam.json()).toMatchObject({ path: '/content/dam', folders: [{ name: 'brand' }] });
    const brand = await app.inject({ method: 'GET', url: '/api/folders?path=/content/dam/brand' });
    expect(brand.json<{ folders: { name: string }[] }>().folders.map((f) => f.name)).toEqual([
      'empty-soon',
      'fall-launch',
      'holiday-promo',
    ]);
  });

  it('returns 404 for missing and 400 for invalid paths', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/folders?path=/content/dam/nope' })).statusCode).toBe(404);
    for (const p of ['/etc/passwd', '/content/dam/../../etc', 'content/dam']) {
      const res = await app.inject({ method: 'GET', url: `/api/folders?path=${encodeURIComponent(p)}` });
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('watcher routes', () => {
  it('reports health per bound folder', async () => {
    await createCampaign({ folders: [FALL, HOLIDAY] });
    const res = await app.inject({ method: 'GET', url: '/api/watcher/health' });
    const health = res.json<WatcherHealth>();
    expect(health).toMatchObject({ intervalSec: 60, nextTickAt: null });
    expect(health.lastTickAt).not.toBeNull();
    expect(health.folders).toMatchObject([
      { folderPath: FALL, auditReadable: true, assetCount: 5, lastError: null },
      { folderPath: HOLIDAY, auditReadable: false, assetCount: 2, lastError: null },
    ]);
  });

  it('POST /api/watcher/poll queues a poll and returns 202', async () => {
    await createCampaign({ folders: [EMPTY] });
    messages.length = 0;
    const res = await app.inject({ method: 'POST', url: '/api/watcher/poll' });
    expect(res.statusCode).toBe(202);
    await app.scheduler.pollNow([]);
    expect(messages.filter((m) => m.type === 'health')).toHaveLength(2);
  });
});
