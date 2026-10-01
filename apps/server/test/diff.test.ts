import { describe, expect, it } from 'vitest';
import type { AssetHit } from '../src/aem/AemClient.ts';
import { diffSnapshots, mergeChangedHits } from '../src/watcher/diff.ts';

const D = '/content/dam/brand/fall-launch';
const hit = (name: string, lastModified = '2026-09-01T10:00:00.000Z', extra: Partial<AssetHit> = {}): AssetHit => ({
  path: `${D}/${name}`,
  lastModified,
  lastModifiedBy: 'jdoe',
  format: 'image/jpeg',
  ...extra,
});
const paths = (hits: AssetHit[]) => hits.map((h) => h.path);

describe('diffSnapshots', () => {
  it('detects added assets', () => {
    const r = diffSnapshots([hit('a.jpg')], [hit('a.jpg'), hit('b.jpg')]);
    expect(paths(r.added)).toEqual([`${D}/b.jpg`]);
    expect(r.modified).toEqual([]);
    expect(r.deleted).toEqual([]);
  });

  it('detects modified assets by lastModified', () => {
    const r = diffSnapshots([hit('a.jpg'), hit('b.jpg')], [hit('a.jpg', '2026-09-01T11:00:00.000Z'), hit('b.jpg')]);
    expect(r.modified).toEqual([hit('a.jpg', '2026-09-01T11:00:00.000Z')]);
    expect(r.added).toEqual([]);
    expect(r.deleted).toEqual([]);
  });

  it('detects deleted assets and returns the snapshot entry', () => {
    const gone = hit('gone.pdf', undefined, { format: 'application/pdf' });
    const r = diffSnapshots([hit('a.jpg'), gone], [hit('a.jpg')]);
    expect(r.deleted).toEqual([gone]);
    expect(r.added).toEqual([]);
    expect(r.modified).toEqual([]);
  });

  it('reports nothing when unchanged', () => {
    const snap = [hit('a.jpg'), hit('b.jpg')];
    expect(diffSnapshots(snap, [...snap].reverse())).toEqual({ added: [], modified: [], deleted: [] });
  });

  it('ignores metadata-only differences when lastModified is unchanged', () => {
    const r = diffSnapshots([hit('a.jpg')], [hit('a.jpg', undefined, { lastModifiedBy: 'other' })]);
    expect(r.modified).toEqual([]);
  });

  it('treats everything as added on the first snapshot', () => {
    const r = diffSnapshots([], [hit('c.jpg'), hit('a.jpg'), hit('b.jpg')]);
    expect(paths(r.added)).toEqual([`${D}/a.jpg`, `${D}/b.jpg`, `${D}/c.jpg`]);
    expect(r.modified).toEqual([]);
    expect(r.deleted).toEqual([]);
  });

  it('compares timestamps as instants, not strings', () => {
    const r = diffSnapshots(
      [hit('a.jpg', '2026-09-01T10:00:00Z'), hit('b.jpg', '2026-09-01T12:00:00+02:00')],
      [hit('a.jpg', '2026-09-01T10:00:00.000Z'), hit('b.jpg', '2026-09-01T10:00:00.000Z')],
    );
    expect(r.modified).toEqual([]);
  });

  it('sorts every output by path', () => {
    const r = diffSnapshots(
      [hit('z.jpg'), hit('m.jpg'), hit('y.jpg'), hit('x.jpg')],
      [hit('y.jpg', '2026-09-02T00:00:00Z'), hit('x.jpg', '2026-09-02T00:00:00Z'), hit('c.jpg'), hit('b.jpg')],
    );
    expect(paths(r.added)).toEqual([`${D}/b.jpg`, `${D}/c.jpg`]);
    expect(paths(r.modified)).toEqual([`${D}/x.jpg`, `${D}/y.jpg`]);
    expect(paths(r.deleted)).toEqual([`${D}/m.jpg`, `${D}/z.jpg`]);
  });

  it('handles duplicate paths with last-wins', () => {
    const prev = [hit('a.jpg', '2026-09-01T09:00:00Z'), hit('a.jpg')];
    const current = [hit('a.jpg', '2026-09-01T12:00:00Z'), hit('a.jpg'), hit('b.jpg'), hit('b.jpg')];
    const r = diffSnapshots(prev, current);
    expect(r.modified).toEqual([]);
    expect(paths(r.added)).toEqual([`${D}/b.jpg`]);
  });
});

describe('mergeChangedHits', () => {
  it('lets the changed hit override metadata for shared paths', () => {
    const fresh = hit('a.jpg', '2026-09-01T11:00:00Z', { lastModifiedBy: 'asmith', format: 'image/png' });
    const merged = mergeChangedHits([hit('a.jpg'), hit('b.jpg')], [fresh]);
    expect(merged).toEqual([fresh, hit('b.jpg')]);
  });

  it('adds hits only present in the changed query (race)', () => {
    const merged = mergeChangedHits([hit('b.jpg')], [hit('a.jpg')]);
    expect(paths(merged)).toEqual([`${D}/a.jpg`, `${D}/b.jpg`]);
  });

  it('returns the full list when nothing changed', () => {
    expect(mergeChangedHits([hit('a.jpg')], [])).toEqual([hit('a.jpg')]);
  });
});
