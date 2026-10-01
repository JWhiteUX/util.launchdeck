import type { ChangeEvent, ChangeEventType } from '@launchdeck/shared';
import { ApiRequestError } from './api.ts';

export interface FeedFilters {
  user: string;
  format: string;
}

export const NO_FILTERS: FeedFilters = { user: '', format: '' };

export function filtersToQuery(filters: FeedFilters): { user?: string; format?: string } {
  return {
    ...(filters.user ? { user: filters.user } : {}),
    ...(filters.format ? { format: filters.format } : {}),
  };
}

export const hasFilters = (filters: FeedFilters) => Boolean(filters.user || filters.format);

/** Path shown under the asset name, starting at the watched folder's own name: `fall/hero/a.jpg`. */
export function relativeAssetPath(event: Pick<ChangeEvent, 'folderPath' | 'assetPath'>): string {
  const { folderPath, assetPath } = event;
  if (!assetPath.startsWith(`${folderPath}/`)) return assetPath;
  const folderName = folderPath.slice(folderPath.lastIndexOf('/') + 1);
  return `${folderName}/${assetPath.slice(folderPath.length + 1)}`;
}

/** Matches the server's unreviewedCount: detected after reviewedAt, or everything if never reviewed. */
export function isUnreviewed(event: Pick<ChangeEvent, 'detectedAt'>, reviewedAt: string | null): boolean {
  if (!reviewedAt) return true;
  return Date.parse(event.detectedAt) > Date.parse(reviewedAt);
}

const PILL_BY_TYPE: Record<ChangeEventType, string> = {
  ADDED: 'pill--ok',
  MODIFIED: 'pill--info',
  DELETED: 'pill--error',
};

export function typePillClass(type: ChangeEventType): string {
  return `pill pill--outline ${PILL_BY_TYPE[type]}`;
}

/** Events in `next` whose id wasn't in `prev`. */
export function countNewEvents(prev: readonly Pick<ChangeEvent, 'id'>[], next: readonly Pick<ChangeEvent, 'id'>[]): number {
  const seen = new Set(prev.map((e) => e.id));
  return next.filter((e) => !seen.has(e.id)).length;
}

export function newChangesMessage(n: number): string {
  return n === 1 ? '1 new change' : `${n} new changes`;
}

/** Plain-words error text ending in a full stop. */
export function errorText(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 404 || err.message === 'NotFound') return 'Not found.';
    if (err.message === 'ValidationError') return 'The server rejected the input.';
  }
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw.trim() || 'Unknown error';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
