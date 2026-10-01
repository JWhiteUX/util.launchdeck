import { EMPTY_FOLDER_WARNING_DAYS } from '@launchdeck/shared';
import type { CampaignView } from '@launchdeck/shared';

export type BadgeFields = Pick<CampaignView, 'badge' | 'badgeReason' | 'unreviewedCount'>;

export interface BadgeDisplay {
  label: string;
  tone: 'ok' | 'warn' | 'error';
  /** Plain-English explanation for the `title` attribute. */
  title: string;
}

export function badgeLabel(c: BadgeFields): BadgeDisplay {
  switch (c.badge) {
    case 'green':
      return { label: 'READY', tone: 'ok', title: 'No unreviewed changes' };
    case 'amber': {
      const n = c.unreviewedCount;
      const noun = n === 1 ? 'change' : 'changes';
      return { label: `${n} ${noun.toUpperCase()}`, tone: 'warn', title: `${n} ${noun} since the last review` };
    }
    case 'red':
      return c.badgeReason === 'empty_near_launch'
        ? {
            label: 'EMPTY',
            tone: 'error',
            title: `Folder empty and launch is within ${EMPTY_FOLDER_WARNING_DAYS} days`,
          }
        : { label: 'ERROR', tone: 'error', title: 'The watcher could not read one of the folders' };
  }
}
