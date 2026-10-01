import { existsSync, readdirSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AuditAccessDeniedError,
  FolderNotFoundError,
  HttpAemClient,
  InvalidAemPathError,
  MockAemClient,
  createAemClient,
  mimeFromName,
} from '../src/aem/index.ts';
import { copyFixtures, FIXTURES_DIR } from './fixtures.ts';

const FALL = '/content/dam/brand/fall-launch';
const HOLIDAY = '/content/dam/brand/holiday-promo';
const EMPTY = '/content/dam/brand/empty-soon';
const BASE = new Date('2026-09-01T10:00:00.000Z');
const LATER = new Date('2026-09-02T10:00:00.000Z');

let root: string;
let cleanup: () => void;
let client: MockAemClient;
const fsPath = (jcr: string) => join(root, jcr);

function setAllMtimes(dir: string, time: Date): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) setAllMtimes(p, time);
    else if (!e.name.startsWith('_')) utimesSync(p, time, time);
  }
}

beforeEach(() => {
  ({ root, cleanup } = copyFixtures());
  setAllMtimes(join(root, 'content'), BASE);
  client = new MockAemClient({ rootDir: root });
});
afterEach(() => cleanup());

describe('listFolder', () => {
  it('lists child folders with titles, sorted, skipping _ files', async () => {
    const brand = await client.listFolder('/content/dam/brand');
    expect(brand.path).toBe('/content/dam/brand');
    expect(brand.folders).toEqual([
      { path: EMPTY, name: 'empty-soon', title: 'Empty soon' },
      { path: FALL, name: 'fall-launch', title: 'Fall launch' },
      { path: HOLIDAY, name: 'holiday-promo', title: null },
    ]);
    expect(brand.assets).toEqual([]);
  });

  it('lists immediate assets and subfolders, ignoring control and dot files', async () => {
    writeFileSync(fsPath(`${FALL}/.DS_Store`), 'x');
    const fall = await client.listFolder(`${FALL}/`);
    expect(fall.path).toBe(FALL);
    expect(fall.folders.map((f) => f.name)).toEqual(['social']);
    expect(fall.assets.map((a) => a.name)).toEqual(['banner.png', 'hero.jpg', 'specs.pdf', 'teaser.mp4']);
    expect(fall.assets[1]).toEqual({ path: `${FALL}/hero.jpg`, name: 'hero.jpg' });
  });

  it('returns an empty listing for empty-soon', async () => {
    expect(await client.listFolder(EMPTY)).toEqual({ path: EMPTY, folders: [], assets: [] });
  });

  it('throws FolderNotFoundError for a missing folder or a file path', async () => {
    await expect(client.listFolder('/content/dam/brand/nope')).rejects.toBeInstanceOf(FolderNotFoundError);
    await expect(client.listFolder(`${FALL}/hero.jpg`)).rejects.toBeInstanceOf(FolderNotFoundError);
  });
});

describe('listAllAssets', () => {
  it('recurses, sorts by path and fills format, user and mtime', async () => {
    const hits = await client.listAllAssets(FALL);
    expect(hits).toEqual([
      { path: `${FALL}/banner.png`, lastModified: BASE.toISOString(), lastModifiedBy: 'dev.patel', format: 'image/png' },
      { path: `${FALL}/hero.jpg`, lastModified: BASE.toISOString(), lastModifiedBy: 'maria.chen', format: 'image/jpeg' },
      { path: `${FALL}/social/post-1.png`, lastModified: BASE.toISOString(), lastModifiedBy: 'dev.patel', format: 'image/png' },
      { path: `${FALL}/specs.pdf`, lastModified: BASE.toISOString(), lastModifiedBy: 'maria.chen', format: 'application/pdf' },
      { path: `${FALL}/teaser.mp4`, lastModified: BASE.toISOString(), lastModifiedBy: 'dev.patel', format: 'video/mp4' },
    ]);
  });

  it('uses the client default user when no _meta.json applies', async () => {
    unlinkSync(fsPath(`${HOLIDAY}/_meta.json`));
    const c = new MockAemClient({ rootDir: root, defaultUser: 'svc-mock' });
    expect((await c.listAllAssets(HOLIDAY)).map((h) => h.lastModifiedBy)).toEqual(['svc-mock', 'svc-mock']);
    expect((await client.listAllAssets(HOLIDAY)).map((h) => h.lastModifiedBy)).toEqual(['admin', 'admin']);
  });

  it('reflects mtime as a UTC ISO string', async () => {
    const [hit] = await client.listAllAssets(`${FALL}/social`);
    expect(hit?.lastModified).toBe(statSync(fsPath(`${FALL}/social/post-1.png`)).mtime.toISOString());
    expect(hit?.lastModified).toMatch(/Z$/);
  });

  it('returns [] for an empty folder and throws for a missing one', async () => {
    expect(await client.listAllAssets(EMPTY)).toEqual([]);
    await expect(client.listAllAssets('/content/dam/missing')).rejects.toBeInstanceOf(FolderNotFoundError);
  });

  it('drops deleted files on the next call', async () => {
    unlinkSync(fsPath(`${FALL}/specs.pdf`));
    const paths = (await client.listAllAssets(FALL)).map((h) => h.path);
    expect(paths).not.toContain(`${FALL}/specs.pdf`);
    expect(paths).toHaveLength(4);
  });

  it('picks up an asset added to the previously empty folder', async () => {
    writeFileSync(fsPath(`${EMPTY}/brief.docx`), 'x');
    const [hit] = await client.listAllAssets(EMPTY);
    expect(hit?.format).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
});

describe('queryChangedAssets', () => {
  it('returns everything when since is null', async () => {
    expect(await client.queryChangedAssets(FALL, null)).toHaveLength(5);
  });

  it('returns only assets modified strictly after since', async () => {
    expect(await client.queryChangedAssets(FALL, BASE.toISOString())).toEqual([]);
    utimesSync(fsPath(`${FALL}/hero.jpg`), LATER, LATER);
    const changed = await client.queryChangedAssets(FALL, BASE.toISOString());
    expect(changed).toEqual([
      { path: `${FALL}/hero.jpg`, lastModified: LATER.toISOString(), lastModifiedBy: 'maria.chen', format: 'image/jpeg' },
    ]);
  });
});

describe('queryAuditEvents', () => {
  it('synthesizes ASSET_CREATED, then METADATA_UPDATED, then ASSET_REMOVED', async () => {
    const first = await client.queryAuditEvents(FALL, null);
    expect(first).toHaveLength(5);
    expect(first.every((e) => e.type === 'ASSET_CREATED')).toBe(true);
    expect(first.find((e) => e.path === `${FALL}/hero.jpg`)).toEqual({
      path: `${FALL}/hero.jpg`,
      type: 'ASSET_CREATED',
      userId: 'maria.chen@agency',
      time: BASE.toISOString(),
    });
    expect(first.find((e) => e.path === `${FALL}/social/post-1.png`)?.userId).toBe('sam.rivera@agency');
    expect(first.find((e) => e.path === `${FALL}/banner.png`)?.userId).toBe('dev.patel@agency');

    expect(await client.queryAuditEvents(FALL, BASE.toISOString())).toEqual([]);

    utimesSync(fsPath(`${FALL}/hero.jpg`), LATER, LATER);
    expect(await client.queryAuditEvents(FALL, BASE.toISOString())).toEqual([
      { path: `${FALL}/hero.jpg`, type: 'METADATA_UPDATED', userId: 'maria.chen@agency', time: LATER.toISOString() },
    ]);

    unlinkSync(fsPath(`${FALL}/teaser.mp4`));
    const removed = await client.queryAuditEvents(FALL, LATER.toISOString());
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ path: `${FALL}/teaser.mp4`, type: 'ASSET_REMOVED', userId: 'maria.chen@agency' });
    expect(Date.parse(removed[0]?.time ?? '')).toBeGreaterThan(LATER.getTime());
    expect(await client.queryAuditEvents(FALL, LATER.toISOString())).toEqual([]);
  });

  it('reports new files as ASSET_CREATED', async () => {
    await client.queryAuditEvents(FALL, null);
    writeFileSync(fsPath(`${FALL}/new.webp`), 'x');
    utimesSync(fsPath(`${FALL}/new.webp`), LATER, LATER);
    expect(await client.queryAuditEvents(FALL, BASE.toISOString())).toEqual([
      { path: `${FALL}/new.webp`, type: 'ASSET_CREATED', userId: 'dev.patel@agency', time: LATER.toISOString() },
    ]);
  });

  it('keeps audit memory per instance', async () => {
    await client.queryAuditEvents(FALL, null);
    const fresh = new MockAemClient({ rootDir: root });
    const events = await fresh.queryAuditEvents(FALL, null);
    expect(events.every((e) => e.type === 'ASSET_CREATED')).toBe(true);
  });

  it('throws AuditAccessDeniedError when _audit.json is { denied: true }', async () => {
    const err = await client.queryAuditEvents(HOLIDAY, null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuditAccessDeniedError);
    expect((err as AuditAccessDeniedError).folderPath).toBe(HOLIDAY);
  });

  it('returns [] when _audit.json is missing', async () => {
    expect(await client.queryAuditEvents(EMPTY, null)).toEqual([]);
    unlinkSync(fsPath(`${FALL}/_audit.json`));
    expect(await client.queryAuditEvents(FALL, null)).toEqual([]);
  });

  it('throws FolderNotFoundError for a missing folder', async () => {
    await expect(client.queryAuditEvents('/content/dam/missing', null)).rejects.toBeInstanceOf(FolderNotFoundError);
  });
});

describe('path validation', () => {
  it.each([
    '/content/dam/../../etc',
    '/content/dam/brand/../../../outside',
    '/content/../content/dam/brand',
    '/content/dambrand',
    '/content',
    '/etc/passwd',
    'content/dam/brand',
    '',
  ])('rejects %j', async (p) => {
    await expect(client.listFolder(p)).rejects.toBeInstanceOf(InvalidAemPathError);
    await expect(client.listAllAssets(p)).rejects.toBeInstanceOf(InvalidAemPathError);
    await expect(client.queryAuditEvents(p, null)).rejects.toBeInstanceOf(InvalidAemPathError);
  });

  it('accepts the DAM root', async () => {
    const dam = await client.listFolder('/content/dam');
    expect(dam.folders.map((f) => f.name)).toEqual(['brand']);
  });
});

describe('mimeFromName', () => {
  it('maps known extensions case-insensitively and falls back to octet-stream', () => {
    expect(mimeFromName('a.JPG')).toBe('image/jpeg');
    expect(mimeFromName('a.tif')).toBe('image/tiff');
    expect(mimeFromName('a.mov')).toBe('video/quicktime');
    expect(mimeFromName('a.xyz')).toBe('application/octet-stream');
    expect(mimeFromName('noext')).toBe('application/octet-stream');
  });
});

describe('createAemClient', () => {
  it('returns a MockAemClient in mock mode', () => {
    expect(createAemClient({ AEM_MODE: 'mock', AEM_FIXTURES_DIR: FIXTURES_DIR })).toBeInstanceOf(MockAemClient);
  });

  it('reads the repo fixtures without mutating them', async () => {
    const c = createAemClient({ AEM_MODE: 'mock', AEM_FIXTURES_DIR: FIXTURES_DIR });
    expect((await c.listAllAssets(HOLIDAY)).map((h) => h.path)).toEqual([`${HOLIDAY}/gift-guide.jpg`, `${HOLIDAY}/promo.png`]);
    expect(existsSync(join(FIXTURES_DIR, 'content/dam/brand/empty-soon/_folder.json'))).toBe(true);
  });

  it('returns an HttpAemClient in live mode and refuses an incomplete live config', () => {
    const live = { AEM_MODE: 'live', AEM_FIXTURES_DIR: FIXTURES_DIR } as const;
    expect(() => createAemClient(live)).toThrow('AEM_HOST is required when AEM_MODE=live');
    const client = createAemClient({
      ...live,
      AEM_HOST: 'https://author.example.com',
      AEM_FLAVOR: 'cloud',
      AEM_AUTH: 'devtoken',
      AEM_DEV_TOKEN: 'x',
    });
    expect(client).toBeInstanceOf(HttpAemClient);
  });
});
