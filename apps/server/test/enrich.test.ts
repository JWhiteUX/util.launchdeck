import { describe, expect, it } from 'vitest';
import type { AssetHit, AuditEvent } from '../src/aem/AemClient.ts';
import { toPendingChanges } from '../src/watcher/enrich.ts';
import type { DiffResult } from '../src/watcher/types.ts';

const D = '/content/dam/brand/fall-launch';
const DETECTED = '2026-09-01T12:00:00.000Z';
const hit = (name: string, lastModified = '2026-09-01T10:00:00.000Z', extra: Partial<AssetHit> = {}): AssetHit => ({
  path: `${D}/${name}`,
  lastModified,
  lastModifiedBy: 'jdoe',
  format: 'image/jpeg',
  ...extra,
});
const diff = (d: Partial<DiffResult>): DiffResult => ({ added: [], modified: [], deleted: [], ...d });
const audit = (name: string, type: string, time: string, userId = 'auditor'): AuditEvent => ({
  path: `${D}/${name}`,
  type,
  userId,
  time,
});

describe('toPendingChanges', () => {
  it('falls back to jcr data when audit is unavailable', () => {
    const out = toPendingChanges(
      D,
      diff({ added: [hit('a.jpg')], modified: [hit('b.png', '2026-09-01T11:00:00.000Z', { format: 'image/png' })] }),
      null,
      DETECTED,
    );
    expect(out).toEqual([
      {
        folderPath: D,
        assetPath: `${D}/a.jpg`,
        assetName: 'a.jpg',
        type: 'ADDED',
        format: 'image/jpeg',
        user: 'jdoe',
        userSource: 'jcr',
        occurredAt: '2026-09-01T10:00:00.000Z',
      },
      {
        folderPath: D,
        assetPath: `${D}/b.png`,
        assetName: 'b.png',
        type: 'MODIFIED',
        format: 'image/png',
        user: 'jdoe',
        userSource: 'jcr',
        occurredAt: '2026-09-01T11:00:00.000Z',
      },
    ]);
  });

  it('keeps jcr data when audit is readable but has no match', () => {
    const [c] = toPendingChanges(D, diff({ added: [hit('a.jpg')] }), [], DETECTED);
    expect(c).toMatchObject({ user: 'jdoe', userSource: 'jcr' });
  });

  it('overrides user, time and source on an audit match', () => {
    const [c] = toPendingChanges(
      D,
      diff({ modified: [hit('a.jpg')] }),
      [audit('a.jpg', 'METADATA_UPDATED', '2026-09-01T10:00:03.000Z', 'asmith')],
      DETECTED,
    );
    expect(c).toMatchObject({ user: 'asmith', occurredAt: '2026-09-01T10:00:03.000Z', userSource: 'audit' });
  });

  it('matches ADDED to ASSET_CREATED and ASSET_UPLOADED', () => {
    const out = toPendingChanges(
      D,
      diff({ added: [hit('a.jpg'), hit('b.jpg')] }),
      [audit('a.jpg', 'ASSET_CREATED', '2026-09-01T10:00:01Z', 'u1'), audit('b.jpg', 'ASSET_UPLOADED', '2026-09-01T10:00:02Z', 'u2')],
      DETECTED,
    );
    expect(out.map((c) => [c.user, c.userSource])).toEqual([
      ['u1', 'audit'],
      ['u2', 'audit'],
    ]);
  });

  it('does not let a METADATA_UPDATED attribute an ADDED', () => {
    const [c] = toPendingChanges(
      D,
      diff({ added: [hit('a.jpg')] }),
      [audit('a.jpg', 'METADATA_UPDATED', '2026-09-01T10:00:00Z', 'asmith')],
      DETECTED,
    );
    expect(c).toMatchObject({ user: 'jdoe', userSource: 'jcr' });
  });

  it('treats unknown audit types as modifications only', () => {
    const events = [audit('a.jpg', 'SOMETHING_NEW', '2026-09-01T10:00:00Z', 'x')];
    const [added] = toPendingChanges(D, diff({ added: [hit('a.jpg')] }), events, DETECTED);
    const [modified] = toPendingChanges(D, diff({ modified: [hit('a.jpg')] }), events, DETECTED);
    expect(added).toMatchObject({ userSource: 'jcr' });
    expect(modified).toMatchObject({ user: 'x', userSource: 'audit' });
  });

  it('ignores audit events for other paths', () => {
    const [c] = toPendingChanges(
      D,
      diff({ modified: [hit('a.jpg')] }),
      [audit('other.jpg', 'METADATA_UPDATED', '2026-09-01T10:00:00Z')],
      DETECTED,
    );
    expect(c?.userSource).toBe('jcr');
  });

  it('respects the match window boundary (inclusive)', () => {
    const opts = { matchWindowMs: 60_000 };
    const at = (time: string) =>
      toPendingChanges(D, diff({ modified: [hit('a.jpg')] }), [audit('a.jpg', 'METADATA_UPDATED', time)], DETECTED, opts)[0];
    expect(at('2026-09-01T10:01:00.000Z')?.userSource).toBe('audit');
    expect(at('2026-09-01T09:59:00.000Z')?.userSource).toBe('audit');
    expect(at('2026-09-01T10:01:00.001Z')?.userSource).toBe('jcr');
    expect(at('2026-09-01T09:58:59.999Z')?.userSource).toBe('jcr');
  });

  it('uses a 10 minute default window', () => {
    const run = (time: string) =>
      toPendingChanges(D, diff({ modified: [hit('a.jpg')] }), [audit('a.jpg', 'ASSET_MODIFIED', time)], DETECTED)[0];
    expect(run('2026-09-01T10:10:00.000Z')?.userSource).toBe('audit');
    expect(run('2026-09-01T10:10:00.001Z')?.userSource).toBe('jcr');
  });

  it('picks the nearest of several compatible events', () => {
    const [c] = toPendingChanges(
      D,
      diff({ modified: [hit('a.jpg')] }),
      [
        audit('a.jpg', 'METADATA_UPDATED', '2026-09-01T09:55:00Z', 'far'),
        audit('a.jpg', 'RENDITION_UPDATED', '2026-09-01T10:00:20Z', 'near'),
        audit('a.jpg', 'ASSET_VERSIONED', '2026-09-01T10:02:00Z', 'mid'),
      ],
      DETECTED,
    );
    expect(c?.user).toBe('near');
  });

  it('never reuses one audit event for two changes', () => {
    const out = toPendingChanges(
      D,
      diff({ modified: [hit('a.jpg'), hit('a.jpg', '2026-09-01T10:00:30Z')] }),
      [audit('a.jpg', 'ASSET_UPDATED', '2026-09-01T10:00:00Z', 'once')],
      DETECTED,
    );
    expect(out.map((c) => c.userSource).sort()).toEqual(['audit', 'jcr']);
    expect(out.filter((c) => c.user === 'once')).toHaveLength(1);
  });

  it('gives deletes detectedAt and no user without audit', () => {
    const gone = hit('gone.pdf', undefined, { format: 'application/pdf', lastModifiedBy: 'editor' });
    const [c] = toPendingChanges(D, diff({ deleted: [gone] }), null, DETECTED);
    expect(c).toEqual({
      folderPath: D,
      assetPath: `${D}/gone.pdf`,
      assetName: 'gone.pdf',
      type: 'DELETED',
      format: 'application/pdf',
      user: null,
      userSource: 'jcr',
      occurredAt: DETECTED,
    });
  });

  it('attributes deletes to the latest ASSET_REMOVED event regardless of window', () => {
    const [c] = toPendingChanges(
      D,
      diff({ deleted: [hit('gone.pdf')] }),
      [
        audit('gone.pdf', 'ASSET_REMOVED', '2026-08-01T00:00:00Z', 'old'),
        audit('gone.pdf', 'ASSET_DELETED', '2026-09-01T11:30:00Z', 'remover'),
        audit('gone.pdf', 'METADATA_UPDATED', '2026-09-01T11:59:00Z', 'editor'),
      ],
      DETECTED,
    );
    expect(c).toMatchObject({ type: 'DELETED', user: 'remover', occurredAt: '2026-09-01T11:30:00Z', userSource: 'audit' });
  });

  it('extracts the asset name from nested paths', () => {
    const nested = { ...hit('x'), path: `${D}/sub/deeper/hero final.jpg` };
    const [c] = toPendingChanges(D, diff({ added: [nested] }), null, DETECTED);
    expect(c?.assetName).toBe('hero final.jpg');
    expect(c?.folderPath).toBe(D);
  });

  it('orders output by occurredAt then assetPath', () => {
    const out = toPendingChanges(
      D,
      diff({
        added: [hit('b.jpg', '2026-09-01T10:00:00Z'), hit('c.jpg', '2026-09-01T09:00:00Z')],
        modified: [hit('a.jpg', '2026-09-01T10:00:00.000Z')],
        deleted: [hit('d.jpg')],
      }),
      [audit('c.jpg', 'ASSET_CREATED', '2026-09-01T09:05:00Z')],
      DETECTED,
    );
    expect(out.map((c) => c.assetName)).toEqual(['c.jpg', 'a.jpg', 'b.jpg', 'd.jpg']);
  });
});
