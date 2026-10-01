import type { AemClient, AssetEntry, AssetHit, AuditEvent, FolderEntry, FolderListing } from './AemClient.ts';
import { AuditAccessDeniedError, FolderNotFoundError } from './AemClient.ts';
import { AemAuthError, AemForbiddenError, AemNotFoundError } from './errors.ts';
import type { AemHttp, Query } from './http.ts';
import type { AemLog } from './log.ts';
import { silentLog } from './log.ts';
import { parseSiren, queryHits, queryTotal, toAssetHit, toAuditEvent } from './parse.ts';
import type { HitResult } from './parse.ts';
import { damRelative, normalizeAemPath } from './paths.ts';

export const PAGE_LIMIT = 100;
const MAX_PAGES = 1000;
const QUERY_BUILDER = '/bin/querybuilder.json';
const AUDIT_ROOT = '/var/audit/com.day.cq.dam';
const ASSET_PROPS = 'jcr:path jcr:content/jcr:lastModified jcr:content/jcr:lastModifiedBy jcr:content/metadata/dc:format';
const AUDIT_PROPS = 'cq:path cq:type cq:userid cq:time';

export interface HttpAemClientOptions {
  http: AemHttp;
  log?: AemLog;
}

const byName = <T extends { name: string }>(a: T, b: T) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const byPath = (a: AssetHit, b: AssetHit) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const assetsApi = (folder: string) => `/api/assets${damRelative(folder)}.json`;
const isDenied = (err: unknown) =>
  err instanceof AemAuthError || err instanceof AemForbiddenError || err instanceof AemNotFoundError;

/** Live, read-only AemClient over the Assets HTTP API and QueryBuilder (GET only, via AemHttp). */
export class HttpAemClient implements AemClient {
  private readonly http: AemHttp;
  private readonly log: AemLog;
  private auditProbe: Promise<boolean> | null = null;
  private readonly dateWarned = new Set<string>();

  constructor(opts: HttpAemClientOptions) {
    this.http = opts.http;
    this.log = opts.log ?? silentLog;
  }

  async listFolder(path: string): Promise<FolderListing> {
    const folder = normalizeAemPath(path);
    const folders = new Map<string, FolderEntry>();
    const assets = new Map<string, AssetEntry>();
    for (let page = 0, offset = 0; page < MAX_PAGES; page++, offset += PAGE_LIMIT) {
      const json = await this.notFoundAs(folder, () =>
        this.http.getJson(assetsApi(folder), { offset, limit: PAGE_LIMIT }),
      );
      const parsed = parseSiren(json, folder);
      const before = folders.size + assets.size;
      for (const f of parsed.folders) folders.set(f.name, f);
      for (const a of parsed.assets) assets.set(a.name, a);
      // Stop on a short page, or when a server that ignores offset repeats itself.
      if (parsed.count < PAGE_LIMIT || folders.size + assets.size === before) break;
    }
    return { path: folder, folders: [...folders.values()].sort(byName), assets: [...assets.values()].sort(byName) };
  }

  async queryChangedAssets(path: string, since: string | null): Promise<AssetHit[]> {
    return this.queryAssets(normalizeAemPath(path), since);
  }

  async listAllAssets(path: string): Promise<AssetHit[]> {
    const folder = normalizeAemPath(path);
    // QueryBuilder returns 0 hits for a missing path, so confirm the folder exists first.
    await this.notFoundAs(folder, () => this.http.getJson(assetsApi(folder), { limit: 1 }));
    return this.queryAssets(folder, null);
  }

  async queryAuditEvents(path: string, since: string | null): Promise<AuditEvent[]> {
    const folder = normalizeAemPath(path);
    if (!(await this.auditReadable())) throw new AuditAccessDeniedError(folder);
    const query: Query = { path: `${AUDIT_ROOT}${folder}`, type: 'cq:AuditEvent' };
    if (since) Object.assign(query, dateRange('cq:time', since));
    Object.assign(query, { 'p.hits': 'selective', 'p.properties': AUDIT_PROPS, 'p.limit': -1 });
    let json: unknown;
    try {
      json = await this.http.getJson(QUERY_BUILDER, query);
    } catch (err) {
      if (err instanceof AemAuthError || err instanceof AemForbiddenError) throw new AuditAccessDeniedError(folder);
      throw err;
    }
    return this.collect(queryHits(json).map(toAuditEvent), folder);
  }

  /** Total dam:Asset count under a folder (one QueryBuilder call; used by the smoke script). */
  async countAssets(path: string): Promise<number> {
    const folder = normalizeAemPath(path);
    const json = await this.http.getJson(QUERY_BUILDER, { path: folder, type: 'dam:Asset', 'p.limit': 0 });
    return queryTotal(json);
  }

  private async queryAssets(folder: string, since: string | null): Promise<AssetHit[]> {
    const query: Query = { path: folder, type: 'dam:Asset' };
    if (since) Object.assign(query, dateRange('jcr:content/jcr:lastModified', since));
    Object.assign(query, { 'p.hits': 'selective', 'p.properties': ASSET_PROPS, 'p.limit': -1, orderby: 'path' });
    const json = await this.http.getJson(QUERY_BUILDER, query);
    return this.collect(queryHits(json).map((h) => toAssetHit(h, folder)), folder).sort(byPath);
  }

  private collect<T>(results: HitResult<T>[], folder: string): T[] {
    const values: T[] = [];
    let badDates = 0;
    for (const r of results) {
      if (r.ok) values.push(r.value);
      else if (r.reason === 'date') badDates++;
    }
    if (badDates > 0 && !this.dateWarned.has(folder)) {
      this.dateWarned.add(folder);
      this.log.warn({ folderPath: folder, skipped: badDates }, 'Skipping AEM hits with missing or unparseable dates');
    }
    return values;
  }

  /** Probe once per client: QueryBuilder silently returns 0 hits for paths the account can't read. */
  private auditReadable(): Promise<boolean> {
    this.auditProbe ??= this.http.getJson(`${AUDIT_ROOT}.json`).then(
      () => true,
      (err: unknown) => {
        if (isDenied(err)) return false;
        this.auditProbe = null;
        throw err;
      },
    );
    return this.auditProbe;
  }

  private async notFoundAs<T>(folder: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AemNotFoundError) throw new FolderNotFoundError(folder);
      throw err;
    }
  }
}

function dateRange(property: string, since: string): Query {
  return {
    'daterange.property': property,
    'daterange.lowerBound': since,
    'daterange.lowerOperation': '>',
  };
}
