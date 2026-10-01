import { describe, expect, it } from 'vitest';
import { computeBadge, folderFailing } from './status.ts';
import type { BadgeInput } from './status.ts';

const now = '2026-10-01T12:00:00.000Z';
const okFolder = { lastSuccessAt: '2026-10-01T11:59:00.000Z', lastErrorAt: null, assetCount: 3 };
const base: BadgeInput = { launchDate: '2026-12-01', reviewedAt: null, latestChangeAt: null, folders: [okFolder], now };

describe('computeBadge', () => {
  it('is green with no changes', () => {
    expect(computeBadge(base)).toEqual({ badge: 'green', reason: 'ok' });
  });

  it('is amber when changes are newer than the last review', () => {
    const latestChangeAt = '2026-10-01T11:00:00.000Z';
    expect(computeBadge({ ...base, latestChangeAt }).badge).toBe('amber');
    expect(computeBadge({ ...base, latestChangeAt, reviewedAt: '2026-10-01T10:00:00.000Z' }).badge).toBe('amber');
    expect(computeBadge({ ...base, latestChangeAt, reviewedAt: '2026-10-01T11:30:00.000Z' }).badge).toBe('green');
  });

  it('is red when a folder error is newer than its last success', () => {
    const failing = { ...okFolder, lastErrorAt: '2026-10-01T12:00:00.000Z' };
    expect(computeBadge({ ...base, folders: [okFolder, failing] })).toEqual({ badge: 'red', reason: 'watcher_error' });
    expect(folderFailing({ ...okFolder, lastErrorAt: '2026-10-01T11:00:00.000Z' })).toBe(false);
    expect(folderFailing({ lastSuccessAt: null, lastErrorAt: now, assetCount: null })).toBe(true);
  });

  it('is red when a folder is empty within 7 days of launch', () => {
    const empty = { ...okFolder, assetCount: 0 };
    expect(computeBadge({ ...base, launchDate: '2026-10-07', folders: [empty] })).toEqual({
      badge: 'red',
      reason: 'empty_near_launch',
    });
    expect(computeBadge({ ...base, launchDate: '2026-10-20', folders: [empty] }).badge).toBe('green');
  });

  it('does not treat an unpolled folder as empty', () => {
    const unpolled = { lastSuccessAt: null, lastErrorAt: null, assetCount: null };
    expect(computeBadge({ ...base, launchDate: '2026-10-03', folders: [unpolled] }).badge).toBe('green');
  });
});
