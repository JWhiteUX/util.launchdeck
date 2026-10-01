import type { BadgeReason } from './status.ts';
import type { z } from 'zod';
import type {
  campaign,
  campaignInput,
  campaignStatus,
  changeEvent,
  changeEventType,
  folderHealth,
  userSource,
} from './schemas.ts';

export type CampaignStatus = z.infer<typeof campaignStatus>;
export type CampaignInput = z.infer<typeof campaignInput>;
export type Campaign = z.infer<typeof campaign>;
export type ChangeEventType = z.infer<typeof changeEventType>;
export type UserSource = z.infer<typeof userSource>;
export type ChangeEvent = z.infer<typeof changeEvent>;
export type FolderHealth = z.infer<typeof folderHealth>;

/** Readiness badge shown per campaign. Computed in Phase 3 (status.ts). */
export type Badge = 'green' | 'amber' | 'red';

export interface ApiError {
  error: string;
  issues?: { path: (string | number)[]; message: string }[];
}

/** Campaign as returned by the API: stored fields plus computed readiness. */
export interface CampaignView extends Campaign {
  badge: Badge;
  badgeReason: BadgeReason;
  /** Change events detected after reviewedAt (all events if never reviewed). */
  unreviewedCount: number;
}

export interface WatcherHealth {
  intervalSec: number;
  lastTickAt: string | null;
  nextTickAt: string | null;
  folders: FolderHealth[];
}

/** Payloads sent on GET /api/stream. The SSE `event:` name equals `type`. */
export type StreamMessage =
  | { type: 'change'; events: ChangeEvent[]; campaignIds: string[] }
  | { type: 'health'; health: WatcherHealth }
  | { type: 'campaign'; action: 'created' | 'updated' | 'reviewed'; campaign: CampaignView }
  | { type: 'campaign'; action: 'deleted'; id: string };
