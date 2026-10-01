import type { ChangeEventType, UserSource } from '@launchdeck/shared';
import type { AssetHit } from '../aem/AemClient.ts';

/** Stored snapshot row: one asset in a folder at the last successful poll. */
export type SnapshotEntry = AssetHit;

export interface DiffResult {
  added: AssetHit[];
  modified: AssetHit[];
  /** Entries from the previous snapshot that are gone now. */
  deleted: SnapshotEntry[];
}

/** A detected change before it is stored (no id / detectedAt yet). */
export interface PendingChange {
  folderPath: string;
  assetPath: string;
  assetName: string;
  type: ChangeEventType;
  format: string | null;
  user: string | null;
  userSource: UserSource;
  occurredAt: string;
}
