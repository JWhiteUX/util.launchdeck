import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './api.ts';
import {
  countNewEvents,
  errorText,
  filtersToQuery,
  hasFilters,
  isUnreviewed,
  newChangesMessage,
  relativeAssetPath,
  typePillClass,
} from './feed.ts';

describe('feed helpers', () => {
  it('drops empty filters from the query', () => {
    expect(filtersToQuery({ user: '', format: '' })).toEqual({});
    expect(filtersToQuery({ user: 'jdoe', format: '' })).toEqual({ user: 'jdoe' });
    expect(filtersToQuery({ user: '', format: 'image/png' })).toEqual({ format: 'image/png' });
    expect(hasFilters({ user: '', format: '' })).toBe(false);
    expect(hasFilters({ user: '', format: 'image/png' })).toBe(true);
  });

  it('shows asset paths relative to the watched folder, starting with its name', () => {
    expect(relativeAssetPath({ folderPath: '/content/dam/fall', assetPath: '/content/dam/fall/hero/a.jpg' })).toBe(
      'fall/hero/a.jpg',
    );
    expect(relativeAssetPath({ folderPath: '/content/dam/fall', assetPath: '/content/dam/fall/b.png' })).toBe('fall/b.png');
    expect(relativeAssetPath({ folderPath: '/content/dam/fall', assetPath: '/content/dam/fallback/c.png' })).toBe(
      '/content/dam/fallback/c.png',
    );
  });

  it('treats events detected after reviewedAt as unreviewed', () => {
    const e = { detectedAt: '2026-10-01T12:00:00.000Z' };
    expect(isUnreviewed(e, null)).toBe(true);
    expect(isUnreviewed(e, '2026-10-01T11:59:59.000Z')).toBe(true);
    expect(isUnreviewed(e, '2026-10-01T12:00:00.000Z')).toBe(false);
    expect(isUnreviewed(e, '2026-10-02T00:00:00.000Z')).toBe(false);
  });

  it('maps change types to outline pills', () => {
    expect(typePillClass('ADDED')).toBe('pill pill--outline pill--ok');
    expect(typePillClass('MODIFIED')).toBe('pill pill--outline pill--info');
    expect(typePillClass('DELETED')).toBe('pill pill--outline pill--error');
  });

  it('counts events new since the previous fetch', () => {
    expect(countNewEvents([{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 1 }, { id: 2 }])).toBe(1);
    expect(countNewEvents([{ id: 1 }], [{ id: 1 }])).toBe(0);
    expect(newChangesMessage(1)).toBe('1 new change');
    expect(newChangesMessage(4)).toBe('4 new changes');
  });

  it('turns errors into plain sentences', () => {
    expect(errorText(new ApiRequestError('NotFound', 404))).toBe('Not found.');
    expect(errorText(new ApiRequestError('AEM request failed', 502))).toBe('AEM request failed.');
    expect(errorText(new ApiRequestError('Path must be under /content/dam', 400))).toBe('Path must be under /content/dam.');
    expect(errorText(new TypeError('Failed to fetch'))).toBe('Failed to fetch.');
    expect(errorText('Already done.')).toBe('Already done.');
  });
});
