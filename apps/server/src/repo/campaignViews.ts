import { computeBadge } from '@launchdeck/shared';
import type { Campaign, CampaignView } from '@launchdeck/shared';
import type { EventRepo } from './events.ts';
import type { FolderRepo } from './folders.ts';

export type ToCampaignView = (c: Campaign) => CampaignView;

export function createCampaignViews(deps: { folders: FolderRepo; events: EventRepo; now: () => string }): ToCampaignView {
  return (c) => {
    const stats = deps.events.stats(c.id, c.reviewedAt);
    const { badge, reason } = computeBadge({
      launchDate: c.launchDate,
      reviewedAt: c.reviewedAt,
      latestChangeAt: stats.latestChangeAt,
      folders: deps.folders.badgeStates(c.folders),
      now: deps.now(),
    });
    return { ...c, badge, badgeReason: reason, unreviewedCount: stats.countAfter };
  };
}
