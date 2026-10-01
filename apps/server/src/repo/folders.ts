import type { BadgeFolderState, FolderHealth } from '@launchdeck/shared';
import type { Db } from '../db/index.ts';
import type { SnapshotEntry } from '../watcher/types.ts';

export interface FolderRow {
  folder_path: string;
  last_poll_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  audit_readable: 0 | 1 | null;
  last_lower_bound: string | null;
}

interface SnapshotRow {
  asset_path: string;
  last_modified: string | null;
  last_modified_by: string | null;
  format: string | null;
}

export type FolderRepo = ReturnType<typeof createFolderRepo>;

export function createFolderRepo(db: Db) {
  const stmts = {
    ensure: db.prepare<[string]>('INSERT OR IGNORE INTO folders (folder_path) VALUES (?)'),
    get: db.prepare<[string], FolderRow>('SELECT * FROM folders WHERE folder_path = ?'),
    pollStart: db.prepare<[string, string]>('UPDATE folders SET last_poll_at = ? WHERE folder_path = ?'),
    audit: db.prepare<[0 | 1, string]>('UPDATE folders SET audit_readable = ? WHERE folder_path = ?'),
    error: db.prepare<[string, string, string]>(
      'UPDATE folders SET last_error = ?, last_error_at = ? WHERE folder_path = ?',
    ),
    success: db.prepare<[string, string, string]>(
      'UPDATE folders SET last_success_at = ?, last_lower_bound = ? WHERE folder_path = ?',
    ),
    snapshot: db.prepare<[string], SnapshotRow>(
      `SELECT asset_path, last_modified, last_modified_by, format FROM folder_snapshot
       WHERE folder_path = ? ORDER BY asset_path`,
    ),
    clearSnapshot: db.prepare<[string]>('DELETE FROM folder_snapshot WHERE folder_path = ?'),
    addSnapshot: db.prepare<[string, string, string, string | null, string | null]>(
      `INSERT INTO folder_snapshot (folder_path, asset_path, last_modified, last_modified_by, format)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    count: db.prepare<[string], number>('SELECT COUNT(*) FROM folder_snapshot WHERE folder_path = ?').pluck(),
    bound: db
      .prepare<[], string>('SELECT DISTINCT folder_path FROM campaign_folders ORDER BY folder_path')
      .pluck(),
    campaignsFor: db
      .prepare<[string], string>(
        `SELECT DISTINCT campaign_id FROM campaign_folders
         WHERE folder_path IN (SELECT value FROM json_each(?)) ORDER BY campaign_id`,
      )
      .pluck(),
  };

  const get = (path: string): FolderRow | undefined => stmts.get.get(path);

  function ensure(path: string): FolderRow {
    stmts.ensure.run(path);
    return get(path) as FolderRow;
  }

  /** Snapshot size, or null when the folder has never been polled successfully. */
  function assetCount(row: FolderRow | undefined): number | null {
    return row?.last_success_at ? stmts.count.get(row.folder_path) ?? 0 : null;
  }

  return {
    get,
    ensure,
    markPollStart(path: string, at: string): FolderRow {
      const row = ensure(path);
      stmts.pollStart.run(at, path);
      return { ...row, last_poll_at: at };
    },
    setAuditReadable(path: string, readable: boolean): void {
      stmts.audit.run(readable ? 1 : 0, path);
    },
    recordError(path: string, message: string, at: string): void {
      stmts.ensure.run(path);
      stmts.error.run(message, at, path);
    },
    recordSuccess(path: string, at: string): void {
      stmts.success.run(at, at, path);
    },
    snapshot(path: string): SnapshotEntry[] {
      return stmts.snapshot.all(path).map((r) => ({
        path: r.asset_path,
        lastModified: r.last_modified ?? '',
        lastModifiedBy: r.last_modified_by,
        format: r.format,
      }));
    },
    /** Not transactional on its own; callers wrap it with the event insert. */
    replaceSnapshot(path: string, entries: readonly SnapshotEntry[]): void {
      stmts.clearSnapshot.run(path);
      for (const e of entries) stmts.addSnapshot.run(path, e.path, e.lastModified, e.lastModifiedBy, e.format);
    },
    assetCount: (path: string) => assetCount(get(path)),
    boundPaths: (): string[] => stmts.bound.all(),
    campaignIdsFor: (paths: readonly string[]): string[] =>
      paths.length ? stmts.campaignsFor.all(JSON.stringify(paths)) : [],
    health(paths: readonly string[]): FolderHealth[] {
      return paths.map((p) => {
        const row = get(p);
        return {
          folderPath: p,
          lastPollAt: row?.last_poll_at ?? null,
          lastSuccessAt: row?.last_success_at ?? null,
          lastError: row?.last_error ?? null,
          lastErrorAt: row?.last_error_at ?? null,
          auditReadable: row?.audit_readable == null ? null : row.audit_readable === 1,
          assetCount: assetCount(row),
        };
      });
    },
    badgeStates(paths: readonly string[]): BadgeFolderState[] {
      return paths.map((p) => {
        const row = get(p);
        return {
          lastSuccessAt: row?.last_success_at ?? null,
          lastErrorAt: row?.last_error_at ?? null,
          assetCount: assetCount(row),
        };
      });
    },
  };
}
