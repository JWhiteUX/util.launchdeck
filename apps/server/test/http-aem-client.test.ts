import { afterEach, describe, expect, it } from 'vitest';
import { AuditAccessDeniedError, FolderNotFoundError, HttpAemClient, InvalidAemPathError } from '../src/aem/index.ts';
import { devTokenAuth } from '../src/aem/auth/devtoken.ts';
import { AemForbiddenError, AemHttpError, AemNotFoundError } from '../src/aem/errors.ts';
import type { AemHttp, Query } from '../src/aem/http.ts';
import { createAemHttp } from '../src/aem/http.ts';
import { toIso } from '../src/aem/parse.ts';
import { openDb } from '../src/db/index.ts';
import { createFolderRepo } from '../src/repo/folders.ts';
import { createPoller } from '../src/watcher/poller.ts';
import type { AemStub } from './aem-stub.ts';
import { captureLog, startAemStub } from './aem-stub.ts';
import { spyLog } from './helpers.ts';

const FALL = '/content/dam/brand/fall-launch';

type Handler = (path: string, query: Query) => unknown;

function fakeHttp(handler: Handler) {
  const calls: { path: string; query: Query }[] = [];
  const http: AemHttp = {
    baseUrl: 'https://author.example.com',
    getJson: async <T>(path: string, query: Query = {}) => {
      calls.push({ path, query });
      return handler(path, query) as T;
    },
  };
  return { http, calls };
}

const folderEntity = (name: string, props: Record<string, unknown> = {}) => ({
  class: ['assets/folder'],
  properties: { name, ...props },
});
const assetEntity = (name: string) => ({ class: ['assets/asset'], properties: { name } });

describe('HttpAemClient.listFolder', () => {
  it('parses Siren entities, pages with offset/limit and sorts by name', async () => {
    const all = [
      ...Array.from({ length: 120 }, (_, i) => assetEntity(`a${String(i).padStart(3, '0')}.jpg`)),
      folderEntity('zeta', { 'jcr:title': 'Zeta' }),
      folderEntity('alpha', { title: 'Alpha (title)' }),
      folderEntity('beta'),
      { class: ['assets/asset'], properties: { name: '../escape' } },
      { class: 'unknown', properties: { name: 'thing' } },
    ];
    const { http, calls } = fakeHttp((_path, q) => {
      const offset = Number(q.offset);
      return { class: ['assets/folder'], entities: all.slice(offset, offset + Number(q.limit)) };
    });
    const listing = await new HttpAemClient({ http }).listFolder(`${FALL}/`);
    expect(calls.map((c) => [c.path, c.query.offset, c.query.limit])).toEqual([
      ['/api/assets/brand/fall-launch.json', 0, 100],
      ['/api/assets/brand/fall-launch.json', 100, 100],
    ]);
    expect(listing.path).toBe(FALL);
    expect(listing.folders).toEqual([
      { path: `${FALL}/alpha`, name: 'alpha', title: 'Alpha (title)' },
      { path: `${FALL}/beta`, name: 'beta', title: null },
      { path: `${FALL}/zeta`, name: 'zeta', title: 'Zeta' },
    ]);
    expect(listing.assets).toHaveLength(120);
    expect(listing.assets[0]).toEqual({ path: `${FALL}/a000.jpg`, name: 'a000.jpg' });
  });

  it('lists the DAM root via /api/assets.json and stops when a server ignores offset', async () => {
    const page = Array.from({ length: 100 }, (_, i) => folderEntity(`f${i}`));
    const { http, calls } = fakeHttp(() => ({ entities: page }));
    const listing = await new HttpAemClient({ http }).listFolder('/content/dam');
    expect(calls.map((c) => c.path)).toEqual(['/api/assets.json', '/api/assets.json']);
    expect(listing.folders).toHaveLength(100);
    expect(listing.folders[0]?.path).toBe('/content/dam/f0');
  });

  it('maps 404 to FolderNotFoundError and rejects paths outside the DAM', async () => {
    const { http } = fakeHttp((path) => {
      throw new AemNotFoundError(404, path, 1);
    });
    const client = new HttpAemClient({ http });
    await expect(client.listFolder(`${FALL}/nope`)).rejects.toBeInstanceOf(FolderNotFoundError);
    await expect(client.listAllAssets(`${FALL}/nope`)).rejects.toBeInstanceOf(FolderNotFoundError);
    await expect(client.listFolder('/etc/passwd')).rejects.toBeInstanceOf(InvalidAemPathError);
  });
});

describe('HttpAemClient QueryBuilder', () => {
  const hits = [
    {
      'jcr:path': `${FALL}/hero.jpg`,
      'jcr:content': {
        'jcr:lastModified': 'Wed Oct 01 2026 10:00:00 GMT+0000',
        'jcr:lastModifiedBy': 'maria',
        metadata: { 'dc:format': 'image/jpeg' },
      },
    },
    {
      'jcr:path': `${FALL}/deck.pdf`,
      'jcr:content/jcr:lastModified': '2026-10-01T12:00:00.000+02:00',
      'jcr:content/jcr:lastModifiedBy': 'sam',
      'jcr:content/metadata/dc:format': ['application/pdf', 'x'],
    },
    { 'jcr:path': `${FALL}/broken.png`, 'jcr:content': { 'jcr:lastModified': 'not a date' } },
    { 'jcr:path': `${FALL}/nodate.png` },
    { 'jcr:path': '/content/dam/elsewhere/x.png', 'jcr:content': { 'jcr:lastModified': '2026-10-01T00:00:00Z' } },
    'garbage',
  ];

  it('builds the query and parses nested + flat selective hits', async () => {
    const { http, calls } = fakeHttp(() => ({ success: true, hits }));
    const { log, lines } = captureLog();
    const client = new HttpAemClient({ http, log });
    const result = await client.queryChangedAssets(FALL, '2026-09-30T00:00:00.000Z');
    expect(calls[0]).toEqual({
      path: '/bin/querybuilder.json',
      query: {
        path: FALL,
        type: 'dam:Asset',
        'daterange.property': 'jcr:content/jcr:lastModified',
        'daterange.lowerBound': '2026-09-30T00:00:00.000Z',
        'daterange.lowerOperation': '>',
        'p.hits': 'selective',
        'p.properties':
          'jcr:path jcr:content/jcr:lastModified jcr:content/jcr:lastModifiedBy jcr:content/metadata/dc:format',
        'p.limit': -1,
        orderby: 'path',
      },
    });
    expect(result).toEqual([
      { path: `${FALL}/deck.pdf`, lastModified: '2026-10-01T10:00:00.000Z', lastModifiedBy: 'sam', format: 'application/pdf' },
      { path: `${FALL}/hero.jpg`, lastModified: '2026-10-01T10:00:00.000Z', lastModifiedBy: 'maria', format: 'image/jpeg' },
    ]);
    await client.queryChangedAssets(FALL, null);
    expect(calls[1]?.query).not.toHaveProperty('daterange.property');
    expect(lines.filter((l) => l.startsWith('Skipping AEM hits'))).toHaveLength(1);
    expect(lines[0]).toContain('"skipped":2');
  });

  it('listAllAssets confirms the folder via the Assets API, then queries without a date range', async () => {
    const { http, calls } = fakeHttp((path) => (path === '/bin/querybuilder.json' ? { hits: hits.slice(0, 1) } : {}));
    const result = await new HttpAemClient({ http }).listAllAssets(FALL);
    expect(calls.map((c) => c.path)).toEqual(['/api/assets/brand/fall-launch.json', '/bin/querybuilder.json']);
    expect(calls[0]?.query).toEqual({ limit: 1 });
    expect(calls[1]?.query).not.toHaveProperty('daterange.lowerBound');
    expect(result.map((h) => h.path)).toEqual([`${FALL}/hero.jpg`]);
  });

  it('countAssets reads total from a p.limit=0 query', async () => {
    const { http, calls } = fakeHttp(() => ({ success: true, results: 0, total: 1234, hits: [] }));
    await expect(new HttpAemClient({ http }).countAssets(FALL)).resolves.toBe(1234);
    expect(calls[0]?.query).toEqual({ path: FALL, type: 'dam:Asset', 'p.limit': 0 });
  });

  it('normalises dates', () => {
    expect(toIso('Wed Oct 01 2026 10:00:00 GMT+0000')).toBe('2026-10-01T10:00:00.000Z');
    expect(toIso('Wed Oct 01 2026 12:00:00 GMT+0200 (Central European Summer Time)')).toBe('2026-10-01T10:00:00.000Z');
    expect(toIso(Date.UTC(2026, 9, 1))).toBe('2026-10-01T00:00:00.000Z');
    expect(toIso('nope')).toBeNull();
    expect(toIso(undefined)).toBeNull();
  });
});

describe('HttpAemClient.queryAuditEvents', () => {
  it('probes once, then queries cq:AuditEvent under /var/audit/com.day.cq.dam{folder}', async () => {
    const { http, calls } = fakeHttp((path) =>
      path === '/var/audit/com.day.cq.dam.json'
        ? {}
        : {
            hits: [
              {
                'cq:path': `${FALL}/hero.jpg`,
                'cq:type': 'ASSET_CREATED',
                'cq:userid': 'maria',
                'cq:time': 'Wed Oct 01 2026 10:00:00 GMT+0000',
              },
              { 'cq:path': `${FALL}/x.jpg`, 'cq:type': 'METADATA_UPDATED', 'cq:time': 1790000000000 },
              { 'cq:type': 'ASSET_REMOVED' },
            ],
          },
    );
    const client = new HttpAemClient({ http });
    const events = await client.queryAuditEvents(FALL, '2026-09-30T00:00:00.000Z');
    await client.queryAuditEvents(FALL, null);
    expect(calls.map((c) => c.path)).toEqual([
      '/var/audit/com.day.cq.dam.json',
      '/bin/querybuilder.json',
      '/bin/querybuilder.json',
    ]);
    expect(calls[1]?.query).toEqual({
      path: `/var/audit/com.day.cq.dam${FALL}`,
      type: 'cq:AuditEvent',
      'daterange.property': 'cq:time',
      'daterange.lowerBound': '2026-09-30T00:00:00.000Z',
      'daterange.lowerOperation': '>',
      'p.hits': 'selective',
      'p.properties': 'cq:path cq:type cq:userid cq:time',
      'p.limit': -1,
    });
    expect(events).toEqual([
      { path: `${FALL}/hero.jpg`, type: 'ASSET_CREATED', userId: 'maria', time: '2026-10-01T10:00:00.000Z' },
      { path: `${FALL}/x.jpg`, type: 'METADATA_UPDATED', userId: '', time: new Date(1790000000000).toISOString() },
    ]);
  });

  it('probe 403 → AuditAccessDeniedError, cached for the client lifetime', async () => {
    const { http, calls } = fakeHttp((path) => {
      throw new AemForbiddenError(403, path, 1);
    });
    const client = new HttpAemClient({ http });
    await expect(client.queryAuditEvents(FALL, null)).rejects.toBeInstanceOf(AuditAccessDeniedError);
    await expect(client.queryAuditEvents(`${FALL}/social`, null)).rejects.toThrow(`Audit log not readable for ${FALL}/social`);
    expect(calls).toHaveLength(1);
  });

  it('QueryBuilder 403 → AuditAccessDeniedError; transient probe errors are not cached', async () => {
    let probeFails = true;
    const { http } = fakeHttp((path) => {
      if (path.startsWith('/var/audit')) {
        if (probeFails) throw new AemHttpError(503, path, 5);
        return {};
      }
      throw new AemForbiddenError(403, path, 1);
    });
    const client = new HttpAemClient({ http });
    await expect(client.queryAuditEvents(FALL, null)).rejects.toThrow('AEM 503 on /var/audit/com.day.cq.dam.json after 5 attempts');
    probeFails = false;
    await expect(client.queryAuditEvents(FALL, null)).rejects.toBeInstanceOf(AuditAccessDeniedError);
  });
});

describe('poll end-to-end against a stub AEM', () => {
  let stub: AemStub | null = null;
  afterEach(async () => {
    await stub?.close();
    stub = null;
  });

  it('ADDED on first poll, then MODIFIED/DELETED; audit denied falls back to jcr users', async () => {
    stub = await startAemStub({ auditProbeStatus: 403 });
    const { folders, assets } = stub.state;
    folders.set('/content/dam/brand', null);
    folders.set(FALL, 'Fall launch');
    folders.set(`${FALL}/social`, null);
    assets.set(`${FALL}/hero.jpg`, { lastModified: '2026-09-01T10:00:00Z', by: 'maria', format: 'image/jpeg' });
    assets.set(`${FALL}/specs.pdf`, { lastModified: '2026-09-01T10:00:00Z', by: 'sam', format: ['application/pdf'] });
    assets.set(`${FALL}/social/post.png`, { lastModified: '2026-09-01T11:00:00Z', by: 'lee', format: 'image/png' });

    const http = createAemHttp({ host: stub.url, auth: devTokenAuth('stub-token') });
    const client = new HttpAemClient({ http });
    const db = openDb(':memory:');
    const log = spyLog();
    const poller = createPoller({ db, client, log });

    const first = await poller.pollFolder(FALL);
    expect(first.ok).toBe(true);
    expect(first.events.map((e) => [e.type, e.assetName, e.user, e.userSource, e.format])).toEqual([
      ['ADDED', 'hero.jpg', 'maria', 'jcr', 'image/jpeg'],
      ['ADDED', 'specs.pdf', 'sam', 'jcr', 'application/pdf'],
      ['ADDED', 'post.png', 'lee', 'jcr', 'image/png'],
    ]);
    expect(createFolderRepo(db).get(FALL)?.audit_readable).toBe(0);
    expect(log.warn).toHaveBeenCalledTimes(1);

    const later = new Date(Math.ceil(Date.now() / 1000) * 1000 + 60_000).toISOString();
    assets.set(`${FALL}/hero.jpg`, { lastModified: later, by: 'jo', format: 'image/jpeg' });
    assets.delete(`${FALL}/specs.pdf`);
    stub.state.flatHits = true;

    const second = await poller.pollFolder(FALL);
    expect(second.ok).toBe(true);
    expect(second.events.map((e) => [e.type, e.assetName, e.user])).toEqual([
      ['DELETED', 'specs.pdf', null],
      ['MODIFIED', 'hero.jpg', 'jo'],
    ]);
    expect(second.events.find((e) => e.type === 'MODIFIED')?.occurredAt).toBe(later);
    expect(stub.state.requests.every((r) => r.method === 'GET')).toBe(true);
    expect(stub.state.requests.filter((r) => r.path === '/var/audit/com.day.cq.dam.json')).toHaveLength(1);

    folders.delete(FALL);
    const third = await poller.pollFolder(FALL);
    expect(third.ok).toBe(false);
    expect(createFolderRepo(db).get(FALL)?.last_error).toBe(`Folder not found: ${FALL}`);

    stub.state.script.push(...Array.from({ length: 5 }, () => ({ status: 503, body: 'upstream SECRET body' })));
    folders.set(FALL, null);
    const noWait = createAemHttp({ host: stub.url, auth: devTokenAuth('stub-token'), sleep: async () => {} });
    const failing = createPoller({ db, client: new HttpAemClient({ http: noWait }), log });
    const fourth = await failing.pollFolder(FALL);
    expect(fourth.error).toMatch(/^AEM 503 on \/bin\/querybuilder\.json after 5 attempts$/);
    db.close();
  });
});
