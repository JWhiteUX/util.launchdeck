/**
 * Read-only view of AEM used by the watcher and folder picker.
 * Implementations: MockAemClient (fixtures/aem) and HttpAemClient (Phase 5).
 * All timestamps are UTC ISO strings. All paths are absolute JCR paths
 * (e.g. /content/dam/brand/fall-launch/hero.jpg) with no trailing slash.
 */

import type { AssetEntry, FolderEntry, FolderListing } from '@launchdeck/shared';

export type { AssetEntry, FolderEntry, FolderListing };

/** One dam:Asset hit from QueryBuilder (p.hits=selective). */
export interface AssetHit {
  path: string;
  /** jcr:content/jcr:lastModified */
  lastModified: string;
  /** jcr:content/jcr:lastModifiedBy */
  lastModifiedBy: string | null;
  /** jcr:content/metadata/dc:format */
  format: string | null;
}

/** AEM DAM audit event types (cq:AuditEvent cq:type). Unknown types are kept as-is. */
export type AuditEventType = 'ASSET_CREATED' | 'METADATA_UPDATED' | 'ASSET_REMOVED' | (string & {});

/** One cq:AuditEvent under /var/audit/com.day.cq.dam{folderPath}. */
export interface AuditEvent {
  /** cq:path — the asset the event refers to */
  path: string;
  /** cq:type */
  type: AuditEventType;
  /** cq:userid */
  userId: string;
  /** cq:time */
  time: string;
}

/** The credentials cannot read the audit path. Callers fall back to jcr:lastModifiedBy. */
export class AuditAccessDeniedError extends Error {
  constructor(public readonly folderPath: string) {
    super(`Audit log not readable for ${folderPath}`);
    this.name = 'AuditAccessDeniedError';
  }
}

/** The folder does not exist (404). */
export class FolderNotFoundError extends Error {
  constructor(public readonly folderPath: string) {
    super(`Folder not found: ${folderPath}`);
    this.name = 'FolderNotFoundError';
  }
}

export interface AemClient {
  /** Assets HTTP API: GET /api/assets{path}.json — immediate child folders and assets. */
  listFolder(path: string): Promise<FolderListing>;

  /**
   * QueryBuilder: dam:Asset under `folderPath` (recursive) whose
   * jcr:content/jcr:lastModified is after `since`. `since = null` returns every asset.
   */
  queryChangedAssets(folderPath: string, since: string | null): Promise<AssetHit[]>;

  /** QueryBuilder with no date range: the full asset list, used for snapshot diffs (deletes). */
  listAllAssets(folderPath: string): Promise<AssetHit[]>;

  /**
   * QueryBuilder over cq:AuditEvent nodes under /var/audit/com.day.cq.dam{folderPath}
   * with cq:time after `since` (null = all). Throws AuditAccessDeniedError when not readable.
   */
  queryAuditEvents(folderPath: string, since: string | null): Promise<AuditEvent[]>;
}
