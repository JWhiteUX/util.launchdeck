import type { ChangeEvent } from '@launchdeck/shared';
import type { AemClient, AuditEvent } from '../aem/AemClient.ts';
import { AuditAccessDeniedError } from '../aem/AemClient.ts';
import { isoNow } from '../clock.ts';
import type { Db } from '../db/index.ts';
import { createEventRepo } from '../repo/events.ts';
import { createFolderRepo } from '../repo/folders.ts';
import type { FolderRow } from '../repo/folders.ts';
import { diffSnapshots, mergeChangedHits } from './diff.ts';
import { toPendingChanges } from './enrich.ts';
import type { PendingChange, SnapshotEntry, WatcherLog } from './types.ts';

export const MAX_ERROR_LENGTH = 500;

export interface PollResult {
  folderPath: string;
  ok: boolean;
  events: ChangeEvent[];
  error?: string;
}

export interface PollerDeps {
  db: Db;
  client: AemClient;
  log: WatcherLog;
  now?: () => string;
}

export type Poller = ReturnType<typeof createPoller>;

export const errorMessage = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_LENGTH);

export function createPoller({ db, client, log, now = isoNow }: PollerDeps) {
  const folders = createFolderRepo(db);
  const events = createEventRepo(db);
  // Folders found audit-denied in this process. Access is re-checked once per
  // process start, so fixing AEM permissions takes effect after a restart.
  const auditDenied = new Set<string>();
  const errorWarned = new Set<string>();

  const commit = db.transaction(
    (path: string, current: SnapshotEntry[], pending: PendingChange[], at: string): ChangeEvent[] => {
      folders.replaceSnapshot(path, current);
      const stored = events.insertMany(pending, at);
      folders.recordSuccess(path, at);
      return stored;
    },
  );

  /** null means "no audit data this poll": enrichment falls back to jcr:lastModifiedBy. */
  async function readAudit(row: FolderRow, since: string | null): Promise<AuditEvent[] | null> {
    const path = row.folder_path;
    if (auditDenied.has(path)) return null;
    try {
      const audit = await client.queryAuditEvents(path, since);
      if (row.audit_readable !== 1) folders.setAuditReadable(path, true);
      return audit;
    } catch (err) {
      if (err instanceof AuditAccessDeniedError) {
        folders.setAuditReadable(path, false);
        auditDenied.add(path);
        log.warn({ folderPath: path }, 'Audit log not readable; using jcr:lastModifiedBy for this folder');
        return null;
      }
      log.warn(
        { folderPath: path, error: errorMessage(err) },
        'Audit query failed; using jcr:lastModifiedBy for this poll',
      );
      return null;
    }
  }

  function recordFailure(path: string, err: unknown): PollResult {
    const message = errorMessage(err);
    try {
      folders.recordError(path, message, now());
    } catch (dbErr) {
      log.error({ folderPath: path, error: errorMessage(dbErr) }, 'Could not record poll error');
    }
    const key = `${path}\n${message}`;
    if (!errorWarned.has(key)) {
      errorWarned.add(key);
      log.warn({ folderPath: path, error: message }, 'Folder poll failed');
    }
    return { folderPath: path, ok: false, events: [], error: message };
  }

  /** Never throws. Lower bound is the poll start so edits made mid-poll are re-queried next time. */
  async function pollFolder(path: string): Promise<PollResult> {
    try {
      const pollStart = now();
      const row = folders.markPollStart(path, pollStart);
      const since = row.last_lower_bound;

      const changed = await client.queryChangedAssets(path, since);
      const full = await client.listAllAssets(path);
      const current = mergeChangedHits(full, changed);
      const diff = diffSnapshots(folders.snapshot(path), current);
      const audit = await readAudit(row, since);
      const pending = toPendingChanges(path, diff, audit, pollStart);

      return { folderPath: path, ok: true, events: commit(path, current, pending, pollStart) };
    } catch (err) {
      return recordFailure(path, err);
    }
  }

  return { pollFolder };
}
