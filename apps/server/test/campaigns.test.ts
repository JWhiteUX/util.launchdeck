import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ApiError, Campaign } from '@launchdeck/shared';
import { campaign as campaignSchema } from '@launchdeck/shared';
import { testApp, validInput } from './helpers.ts';

let app: FastifyInstance;

beforeEach(async () => {
  app = await testApp();
});
afterEach(async () => {
  await app.close();
});

async function create(body: unknown = validInput) {
  const res = await app.inject({ method: 'POST', url: '/api/campaigns', payload: body as object });
  return { res, body: res.json<Campaign>() };
}

describe('health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe('campaign CRUD', () => {
  it('creates, reads, lists, updates and deletes', async () => {
    const { res, body: created } = await create();
    expect(res.statusCode).toBe(201);
    expect(campaignSchema.parse(created)).toEqual(created);
    expect(created).toMatchObject({
      name: 'Fall launch',
      owner: 'jdoe',
      status: 'planned',
      reviewedAt: null,
      folders: ['/content/dam/brand/assets', '/content/dam/brand/fall-launch'],
    });
    expect(created.createdAt).toBe(created.updatedAt);

    const got = await app.inject({ method: 'GET', url: `/api/campaigns/${created.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toEqual(created);

    const list = await app.inject({ method: 'GET', url: '/api/campaigns' });
    expect(list.json()).toEqual([created]);

    const put = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${created.id}`,
      payload: { ...validInput, name: 'Fall launch v2', status: 'in_progress' },
    });
    expect(put.statusCode).toBe(200);
    const updated = put.json<Campaign>();
    expect(updated).toMatchObject({ id: created.id, name: 'Fall launch v2', status: 'in_progress' });
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt > created.updatedAt).toBe(true);

    const del = await app.inject({ method: 'DELETE', url: `/api/campaigns/${created.id}` });
    expect(del.statusCode).toBe(204);
    expect(del.body).toBe('');
    expect((await app.inject({ method: 'GET', url: '/api/campaigns' })).json()).toEqual([]);
  });

  it('lists campaigns ordered by start date', async () => {
    await create({ ...validInput, name: 'Later', startDate: '2026-11-01', launchDate: '2026-11-05' });
    await create({ ...validInput, name: 'Sooner' });
    const names = (await app.inject({ method: 'GET', url: '/api/campaigns' })).json<Campaign[]>().map((c) => c.name);
    expect(names).toEqual(['Sooner', 'Later']);
  });

  it('trims name and owner', async () => {
    const { body } = await create({ ...validInput, name: '  Spaced  ', owner: ' me ' });
    expect(body).toMatchObject({ name: 'Spaced', owner: 'me' });
  });

  it('update replaces the folder set', async () => {
    const { body: c } = await create();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${c.id}`,
      payload: { ...validInput, folders: ['/content/dam/brand/new', '/content/dam/brand/assets'] },
    });
    expect(res.json<Campaign>().folders).toEqual(['/content/dam/brand/assets', '/content/dam/brand/new']);
    const rows = app.db
      .prepare('SELECT folder_path FROM campaign_folders WHERE campaign_id = ? ORDER BY folder_path')
      .pluck()
      .all(c.id);
    expect(rows).toEqual(['/content/dam/brand/assets', '/content/dam/brand/new']);
  });

  it('registers each folder in the folders table once', async () => {
    await create();
    await create({ ...validInput, folders: ['/content/dam/brand/assets'] });
    const folders = app.db.prepare('SELECT folder_path FROM folders ORDER BY folder_path').pluck().all();
    expect(folders).toEqual(['/content/dam/brand/assets', '/content/dam/brand/fall-launch']);
  });

  it('review sets reviewedAt', async () => {
    const { body: c } = await create();
    const res = await app.inject({ method: 'POST', url: `/api/campaigns/${c.id}/review` });
    expect(res.statusCode).toBe(200);
    const reviewed = res.json<Campaign>();
    expect(reviewed.reviewedAt).not.toBeNull();
    expect(reviewed.reviewedAt! > c.createdAt).toBe(true);
    expect(reviewed.updatedAt).toBe(reviewed.reviewedAt);
    const again = await app.inject({ method: 'GET', url: `/api/campaigns/${c.id}` });
    expect(again.json<Campaign>().reviewedAt).toBe(reviewed.reviewedAt);
  });

  it('delete cascades campaign_folders but keeps shared folder state', async () => {
    const { body: c } = await create();
    const count = () => app.db.prepare('SELECT COUNT(*) FROM campaign_folders WHERE campaign_id = ?').pluck().get(c.id);
    expect(count()).toBe(2);
    await app.inject({ method: 'DELETE', url: `/api/campaigns/${c.id}` });
    expect(count()).toBe(0);
    expect(app.db.prepare('SELECT COUNT(*) FROM folders').pluck().get()).toBe(2);
  });
});

describe('validation', () => {
  const cases: [string, unknown, (string | number)[]][] = [
    ['malformed start date', { ...validInput, startDate: '10/01/2026' }, ['startDate']],
    ['malformed launch date', { ...validInput, launchDate: '2026-1-5' }, ['launchDate']],
    ['launch before start', { ...validInput, launchDate: '2026-09-01' }, ['launchDate']],
    ['folder outside DAM', { ...validInput, folders: ['/content/site/x'] }, ['folders', 0]],
    ['folder trailing slash', { ...validInput, folders: ['/content/dam/a/'] }, ['folders', 0]],
    ['no folders', { ...validInput, folders: [] }, ['folders']],
    ['unknown status', { ...validInput, status: 'done' }, ['status']],
    ['missing name', { ...validInput, name: undefined }, ['name']],
    ['blank owner', { ...validInput, owner: '   ' }, ['owner']],
  ];

  it.each(cases)('POST rejects %s', async (_label, body, path) => {
    const res = await app.inject({ method: 'POST', url: '/api/campaigns', payload: body as object });
    expect(res.statusCode).toBe(400);
    const err = res.json<ApiError>();
    expect(err.error).toBe('ValidationError');
    expect(err.issues?.map((i) => i.path)).toContainEqual(path);
    expect(err.issues?.every((i) => typeof i.message === 'string' && i.message.length > 0)).toBe(true);
  });

  it('reports every missing field', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/campaigns', payload: {} });
    expect(res.statusCode).toBe(400);
    const paths = res.json<ApiError>().issues?.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['name', 'owner', 'startDate', 'launchDate', 'status', 'folders']));
  });

  it('PUT validates and leaves the campaign unchanged', async () => {
    const { body: c } = await create();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${c.id}`,
      payload: { ...validInput, launchDate: '2026-01-01' },
    });
    expect(res.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/api/campaigns/${c.id}` })).json()).toEqual(c);
  });

  it('rejects a non-JSON body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { 'content-type': 'text/plain' },
      payload: 'nope',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});

describe('not found', () => {
  const missing = '00000000-0000-0000-0000-000000000000';
  it.each([
    ['GET', `/api/campaigns/${missing}`],
    ['PUT', `/api/campaigns/${missing}`],
    ['DELETE', `/api/campaigns/${missing}`],
    ['POST', `/api/campaigns/${missing}/review`],
  ] as const)('%s %s → 404', async (method, url) => {
    const res = await app.inject({ method, url, ...(method === 'PUT' ? { payload: validInput } : {}) });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'NotFound' });
  });
});
