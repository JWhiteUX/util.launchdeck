import type { Badge } from './types.ts';

export interface BadgeFolderState {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  /** Assets in the latest snapshot; null if the folder has never been polled. */
  assetCount: number | null;
}

export interface BadgeInput {
  launchDate: string;
  reviewedAt: string | null;
  /** detectedAt of the newest change event across the campaign's folders, if any. */
  latestChangeAt: string | null;
  folders: BadgeFolderState[];
  /** Current time, UTC ISO. */
  now: string;
}

export type BadgeReason = 'ok' | 'unreviewed' | 'watcher_error' | 'empty_near_launch';

export interface BadgeResult {
  badge: Badge;
  reason: BadgeReason;
}

export const EMPTY_FOLDER_WARNING_DAYS = 7;
const DAY_MS = 86_400_000;

const ms = (iso: string) => Date.parse(iso);

/** A folder is failing when its latest error is newer than its latest success. */
export function folderFailing(f: BadgeFolderState): boolean {
  if (!f.lastErrorAt) return false;
  return !f.lastSuccessAt || ms(f.lastErrorAt) > ms(f.lastSuccessAt);
}

/** Days from `now` until the launch date (start of that day, UTC). Negative once launched. */
export function daysUntilLaunch(launchDate: string, now: string): number {
  return (ms(`${launchDate}T00:00:00.000Z`) - ms(now)) / DAY_MS;
}

export function computeBadge(input: BadgeInput): BadgeResult {
  if (input.folders.some(folderFailing)) return { badge: 'red', reason: 'watcher_error' };

  const days = daysUntilLaunch(input.launchDate, input.now);
  const nearLaunch = days >= -1 && days <= EMPTY_FOLDER_WARNING_DAYS;
  if (nearLaunch && input.folders.some((f) => f.assetCount === 0)) {
    return { badge: 'red', reason: 'empty_near_launch' };
  }

  const unreviewed =
    input.latestChangeAt !== null && (input.reviewedAt === null || ms(input.latestChangeAt) > ms(input.reviewedAt));
  if (unreviewed) return { badge: 'amber', reason: 'unreviewed' };

  return { badge: 'green', reason: 'ok' };
}
