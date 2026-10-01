import type { AssetEntry, AssetHit, AuditEvent, FolderEntry } from './AemClient.ts';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const firstStr = (v: unknown): string | null => (Array.isArray(v) ? str(v[0]) : str(v));

/** ISO, ECMA (`Wed Oct 01 2026 10:00:00 GMT+0000`) or epoch ms → UTC ISO; null when unparseable. */
export function toIso(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(typeof v === 'string' ? v.replace(/ \([^)]*\)$/, '') : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Selective hits may nest (`jcr:content.metadata.dc:format`) or be flat (`jcr:content/metadata/dc:format`). */
export function hitProp(hit: Obj, path: string): unknown {
  if (path in hit) return hit[path];
  let cur: unknown = hit;
  for (const key of path.split('/')) {
    if (!isObj(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

export function queryHits(json: unknown): Obj[] {
  return isObj(json) && Array.isArray(json.hits) ? json.hits.filter(isObj) : [];
}

const isChildOf = (path: string, folder: string) => path.startsWith(`${folder}/`) && !path.split('/').includes('..');

export type HitResult<T> = { ok: true; value: T } | { ok: false; reason: 'path' | 'date' };

export function toAssetHit(hit: Obj, folder: string): HitResult<AssetHit> {
  const path = str(hitProp(hit, 'jcr:path'));
  if (!path || !isChildOf(path, folder)) return { ok: false, reason: 'path' };
  const lastModified = toIso(hitProp(hit, 'jcr:content/jcr:lastModified'));
  if (!lastModified) return { ok: false, reason: 'date' };
  return {
    ok: true,
    value: {
      path,
      lastModified,
      lastModifiedBy: str(hitProp(hit, 'jcr:content/jcr:lastModifiedBy')),
      format: firstStr(hitProp(hit, 'jcr:content/metadata/dc:format')),
    },
  };
}

export function toAuditEvent(hit: Obj): HitResult<AuditEvent> {
  const path = str(hit['cq:path']);
  const type = str(hit['cq:type']);
  if (!path || !type) return { ok: false, reason: 'path' };
  const time = toIso(hit['cq:time']);
  if (!time) return { ok: false, reason: 'date' };
  return { ok: true, value: { path, type, userId: str(hit['cq:userid']) ?? '', time } };
}

export interface SirenPage {
  folders: FolderEntry[];
  assets: AssetEntry[];
  /** Number of entities on the page (including ones skipped), for paging. */
  count: number;
}

const hasClass = (entity: Obj, cls: string) =>
  Array.isArray(entity.class) ? entity.class.includes(cls) : entity.class === cls;
const validName = (name: string | null): name is string =>
  name !== null && !name.includes('/') && name !== '.' && name !== '..';

/** Assets HTTP API Siren listing → child folders and assets of `folder`. */
export function parseSiren(json: unknown, folder: string): SirenPage {
  const entities = isObj(json) && Array.isArray(json.entities) ? json.entities.filter(isObj) : [];
  const folders: FolderEntry[] = [];
  const assets: AssetEntry[] = [];
  for (const entity of entities) {
    const props = isObj(entity.properties) ? entity.properties : {};
    const name = str(props.name);
    if (!validName(name)) continue;
    const path = `${folder}/${name}`;
    if (hasClass(entity, 'assets/folder')) {
      folders.push({ path, name, title: str(props['jcr:title']) ?? str(props.title) });
    } else if (hasClass(entity, 'assets/asset')) {
      assets.push({ path, name });
    }
  }
  return { folders, assets, count: entities.length };
}

export function queryTotal(json: unknown): number {
  if (!isObj(json)) return 0;
  const total = json.total ?? json.results;
  return typeof total === 'number' && Number.isFinite(total) ? total : 0;
}
