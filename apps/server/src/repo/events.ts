import type { ChangeEvent, ChangeEventType, UserSource } from '@launchdeck/shared';
import type { Db } from '../db/index.ts';
import type { PendingChange } from '../watcher/types.ts';

interface EventRow {
  id: number;
  folder_path: string;
  asset_path: string;
  asset_name: string;
  type: ChangeEventType;
  format: string | null;
  user: string | null;
  user_source: UserSource;
  occurred_at: string;
  detected_at: string;
}

export interface EventFilter {
  user?: string | undefined;
  format?: string | undefined;
  limit?: number | undefined;
}

export interface EventStats {
  latestChangeAt: string | null;
  /** Events detected strictly after the given timestamp (all events when it is null). */
  countAfter: number;
}

export const DEFAULT_EVENT_LIMIT = 500;

const toEvent = (r: EventRow): ChangeEvent => ({
  id: r.id,
  folderPath: r.folder_path,
  assetPath: r.asset_path,
  assetName: r.asset_name,
  type: r.type,
  format: r.format,
  user: r.user,
  userSource: r.user_source,
  occurredAt: r.occurred_at,
  detectedAt: r.detected_at,
});

const FOR_CAMPAIGN = `FROM change_events e
  JOIN campaign_folders cf ON cf.folder_path = e.folder_path
  WHERE cf.campaign_id = @campaignId`;

export type EventRepo = ReturnType<typeof createEventRepo>;

export function createEventRepo(db: Db) {
  const stmts = {
    insert: db.prepare<[Record<string, string | null>], EventRow>(
      `INSERT INTO change_events
         (folder_path, asset_path, asset_name, type, format, user, user_source, occurred_at, detected_at)
       VALUES (@folderPath, @assetPath, @assetName, @type, @format, @user, @userSource, @occurredAt, @detectedAt)
       RETURNING *`,
    ),
    list: db.prepare<[{ campaignId: string; user: string | null; format: string | null; limit: number }], EventRow>(
      `SELECT e.* ${FOR_CAMPAIGN}
         AND (@user IS NULL OR e.user = @user)
         AND (@format IS NULL OR e.format = @format)
       ORDER BY e.detected_at DESC, e.id DESC
       LIMIT @limit`,
    ),
    users: db
      .prepare<[{ campaignId: string }], string>(
        `SELECT DISTINCT e.user ${FOR_CAMPAIGN} AND e.user IS NOT NULL ORDER BY e.user`,
      )
      .pluck(),
    formats: db
      .prepare<[{ campaignId: string }], string>(
        `SELECT DISTINCT e.format ${FOR_CAMPAIGN} AND e.format IS NOT NULL ORDER BY e.format`,
      )
      .pluck(),
    stats: db.prepare<
      [{ campaignId: string; after: string | null }],
      { latest: string | null; countAfter: number | null }
    >(
      `SELECT MAX(e.detected_at) AS latest,
              SUM(CASE WHEN @after IS NULL OR e.detected_at > @after THEN 1 ELSE 0 END) AS countAfter
       ${FOR_CAMPAIGN}`,
    ),
  };

  return {
    /** Inserts with the given detectedAt and returns the stored rows. Not a transaction on its own. */
    insertMany(changes: readonly PendingChange[], detectedAt: string): ChangeEvent[] {
      return changes.map((c) => {
        const row = stmts.insert.get({
          folderPath: c.folderPath,
          assetPath: c.assetPath,
          assetName: c.assetName,
          type: c.type,
          format: c.format,
          user: c.user,
          userSource: c.userSource,
          occurredAt: c.occurredAt,
          detectedAt,
        });
        return toEvent(row as EventRow);
      });
    },
    /** Newest first. */
    listForCampaign(campaignId: string, filter: EventFilter = {}): ChangeEvent[] {
      return stmts.list
        .all({
          campaignId,
          user: filter.user ?? null,
          format: filter.format ?? null,
          limit: filter.limit ?? DEFAULT_EVENT_LIMIT,
        })
        .map(toEvent);
    },
    facets(campaignId: string): { users: string[]; formats: string[] } {
      return { users: stmts.users.all({ campaignId }), formats: stmts.formats.all({ campaignId }) };
    },
    stats(campaignId: string, after: string | null): EventStats {
      const row = stmts.stats.get({ campaignId, after });
      return { latestChangeAt: row?.latest ?? null, countAfter: row?.countAfter ?? 0 };
    },
  };
}
