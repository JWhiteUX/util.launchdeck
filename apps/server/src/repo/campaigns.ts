import { randomUUID } from 'node:crypto';
import type { Campaign, CampaignInput, CampaignStatus } from '@launchdeck/shared';
import type { Db } from '../db/index.ts';

interface CampaignRow {
  id: string;
  name: string;
  owner: string;
  start_date: string;
  launch_date: string;
  status: CampaignStatus;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignRepoOptions {
  now?: () => string;
  newId?: () => string;
}

export type CampaignRepo = ReturnType<typeof createCampaignRepo>;

export function createCampaignRepo(db: Db, opts: CampaignRepoOptions = {}) {
  const now = opts.now ?? (() => new Date().toISOString());
  const newId = opts.newId ?? randomUUID;

  const stmts = {
    list: db.prepare<[], CampaignRow>('SELECT * FROM campaigns ORDER BY start_date, name, id'),
    get: db.prepare<[string], CampaignRow>('SELECT * FROM campaigns WHERE id = ?'),
    allFolders: db.prepare<[], { campaign_id: string; folder_path: string }>(
      'SELECT campaign_id, folder_path FROM campaign_folders ORDER BY folder_path',
    ),
    folders: db.prepare<[string], { folder_path: string }>(
      'SELECT folder_path FROM campaign_folders WHERE campaign_id = ? ORDER BY folder_path',
    ),
    insert: db.prepare(
      `INSERT INTO campaigns (id, name, owner, start_date, launch_date, status, reviewed_at, created_at, updated_at)
       VALUES (@id, @name, @owner, @start_date, @launch_date, @status, NULL, @created_at, @updated_at)`,
    ),
    update: db.prepare(
      `UPDATE campaigns SET name = @name, owner = @owner, start_date = @start_date, launch_date = @launch_date,
       status = @status, updated_at = @updated_at WHERE id = @id`,
    ),
    delete: db.prepare<[string]>('DELETE FROM campaigns WHERE id = ?'),
    review: db.prepare<[string, string, string]>('UPDATE campaigns SET reviewed_at = ?, updated_at = ? WHERE id = ?'),
    clearFolders: db.prepare<[string]>('DELETE FROM campaign_folders WHERE campaign_id = ?'),
    addFolder: db.prepare<[string, string]>('INSERT INTO campaign_folders (campaign_id, folder_path) VALUES (?, ?)'),
    ensureFolder: db.prepare<[string]>('INSERT OR IGNORE INTO folders (folder_path) VALUES (?)'),
  };

  const toCampaign = (row: CampaignRow, folders: string[]): Campaign => ({
    id: row.id,
    name: row.name,
    owner: row.owner,
    startDate: row.start_date,
    launchDate: row.launch_date,
    status: row.status,
    folders,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const fields = (input: CampaignInput) => ({
    name: input.name,
    owner: input.owner,
    start_date: input.startDate,
    launch_date: input.launchDate,
    status: input.status,
  });

  const setFolders = (id: string, folders: string[]) => {
    stmts.clearFolders.run(id);
    for (const f of folders) {
      stmts.addFolder.run(id, f);
      stmts.ensureFolder.run(f);
    }
  };

  function get(id: string): Campaign | undefined {
    const row = stmts.get.get(id);
    return row && toCampaign(row, stmts.folders.all(id).map((r) => r.folder_path));
  }

  function list(): Campaign[] {
    const byCampaign = new Map<string, string[]>();
    for (const { campaign_id, folder_path } of stmts.allFolders.all()) {
      const arr = byCampaign.get(campaign_id) ?? [];
      arr.push(folder_path);
      byCampaign.set(campaign_id, arr);
    }
    return stmts.list.all().map((row) => toCampaign(row, byCampaign.get(row.id) ?? []));
  }

  const create = db.transaction((input: CampaignInput): Campaign => {
    const id = newId();
    const ts = now();
    stmts.insert.run({ id, ...fields(input), created_at: ts, updated_at: ts });
    setFolders(id, input.folders);
    return get(id) as Campaign;
  });

  const update = db.transaction((id: string, input: CampaignInput): Campaign | undefined => {
    const res = stmts.update.run({ id, ...fields(input), updated_at: now() });
    if (res.changes === 0) return undefined;
    setFolders(id, input.folders);
    return get(id);
  });

  function remove(id: string): boolean {
    return stmts.delete.run(id).changes > 0;
  }

  function markReviewed(id: string): Campaign | undefined {
    const ts = now();
    return stmts.review.run(ts, ts, id).changes > 0 ? get(id) : undefined;
  }

  return { list, get, create, update, delete: remove, markReviewed };
}
