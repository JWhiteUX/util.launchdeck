import { readFile, readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { isAbsolute, posix, relative, resolve, sep } from 'node:path';
import type { AemClient, AssetEntry, AssetHit, AuditEvent, FolderEntry, FolderListing } from './AemClient.ts';
import { AuditAccessDeniedError, FolderNotFoundError } from './AemClient.ts';
import { mimeFromName } from './mime.ts';
import { DAM_ROOT, InvalidAemPathError, normalizeAemPath } from './paths.ts';

export { InvalidAemPathError, normalizeAemPath };

export interface MockAemLogger {
  warn(msg: string): void;
}

export interface MockAemClientOptions {
  rootDir: string;
  defaultUser?: string;
  logger?: MockAemLogger;
}

interface MetaFile {
  defaultUser?: string;
  assets?: Record<string, { lastModifiedBy?: string }>;
}

interface AuditFile {
  denied?: boolean;
  users?: Record<string, string>;
  defaultUser?: string;
}

const isHidden = (name: string) => name.startsWith('_') || name.startsWith('.');
const byKey = <T>(key: (t: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);

/**
 * AemClient over a directory tree (AEM_FIXTURES_DIR). Re-reads the filesystem on every call;
 * there is no fs watcher. Files are assets, directories are folders, `_`/`.` names are ignored.
 */
export class MockAemClient implements AemClient {
  private readonly rootDir: string;
  private readonly defaultUser: string;
  private readonly logger: MockAemLogger | undefined;
  /** Paths this instance has already returned from queryAuditEvents. */
  private readonly auditSeen = new Map<string, true>();

  constructor(opts: MockAemClientOptions) {
    this.rootDir = resolve(opts.rootDir);
    this.defaultUser = opts.defaultUser ?? 'admin';
    this.logger = opts.logger;
  }

  async listFolder(path: string): Promise<FolderListing> {
    const folderPath = normalizeAemPath(path);
    const dir = this.toFs(folderPath);
    const entries = await this.readDir(dir, folderPath);
    const folders: FolderEntry[] = [];
    const assets: AssetEntry[] = [];
    for (const e of entries) {
      if (isHidden(e.name)) continue;
      const childPath = posix.join(folderPath, e.name);
      if (e.isDirectory()) {
        const meta = await this.readJson<{ title?: unknown }>(resolve(dir, e.name, '_folder.json'));
        folders.push({ path: childPath, name: e.name, title: typeof meta?.title === 'string' ? meta.title : null });
      } else if (e.isFile()) {
        assets.push({ path: childPath, name: e.name });
      }
    }
    return { path: folderPath, folders: folders.sort(byKey((f) => f.name)), assets: assets.sort(byKey((a) => a.name)) };
  }

  async listAllAssets(path: string): Promise<AssetHit[]> {
    const folderPath = normalizeAemPath(path);
    const hits: AssetHit[] = [];
    await this.walk(folderPath, hits);
    return hits.sort(byKey((h) => h.path));
  }

  async queryChangedAssets(path: string, since: string | null): Promise<AssetHit[]> {
    const all = await this.listAllAssets(path);
    if (since === null) return all;
    const sinceMs = Date.parse(since);
    return all.filter((h) => Date.parse(h.lastModified) > sinceMs);
  }

  /**
   * Mock audit log driven by `<folder>/_audit.json`. Missing file → no events; `{ denied: true }` →
   * AuditAccessDeniedError; otherwise events are synthesized from the filesystem: each asset with
   * mtime > since is ASSET_CREATED the first time this instance reports it and METADATA_UPDATED
   * after that; previously reported paths that are gone become ASSET_REMOVED (time = now).
   * userId comes from `users[<name or relative path>]`, then `defaultUser`, then the client default.
   */
  async queryAuditEvents(path: string, since: string | null): Promise<AuditEvent[]> {
    const folderPath = normalizeAemPath(path);
    const dir = this.toFs(folderPath);
    await this.readDir(dir, folderPath);
    const audit = await this.readJson<AuditFile>(resolve(dir, '_audit.json'));
    if (!audit) return [];
    if (audit.denied === true) throw new AuditAccessDeniedError(folderPath);

    const userFor = (assetPath: string) =>
      audit.users?.[posix.relative(folderPath, assetPath)] ??
      audit.users?.[posix.basename(assetPath)] ??
      audit.defaultUser ??
      this.defaultUser;

    const assets = await this.queryChangedAssets(folderPath, since);
    const events: AuditEvent[] = assets.map((a) => {
      const type = this.auditSeen.has(a.path) ? 'METADATA_UPDATED' : 'ASSET_CREATED';
      this.auditSeen.set(a.path, true);
      return { path: a.path, type, userId: userFor(a.path), time: a.lastModified };
    });

    const existing = new Set((await this.listAllAssets(folderPath)).map((a) => a.path));
    const now = new Date().toISOString();
    for (const seen of [...this.auditSeen.keys()].sort()) {
      if (!seen.startsWith(`${folderPath}/`) || existing.has(seen)) continue;
      this.auditSeen.delete(seen);
      events.push({ path: seen, type: 'ASSET_REMOVED', userId: userFor(seen), time: now });
    }
    return events;
  }

  private async walk(folderPath: string, hits: AssetHit[]): Promise<void> {
    const dir = this.toFs(folderPath);
    for (const e of await this.readDir(dir, folderPath)) {
      if (isHidden(e.name)) continue;
      const childPath = posix.join(folderPath, e.name);
      if (e.isDirectory()) {
        await this.walk(childPath, hits);
      } else if (e.isFile()) {
        const { mtime } = await stat(resolve(dir, e.name));
        hits.push({
          path: childPath,
          lastModified: mtime.toISOString(),
          lastModifiedBy: await this.lastModifiedBy(folderPath, e.name),
          format: mimeFromName(e.name),
        });
      }
    }
  }

  private async lastModifiedBy(folderPath: string, name: string): Promise<string> {
    for (let p = folderPath; p.startsWith(DAM_ROOT); p = posix.dirname(p)) {
      const meta = await this.readJson<MetaFile>(resolve(this.toFs(p), '_meta.json'));
      if (!meta) continue;
      const own = p === folderPath ? meta.assets?.[name]?.lastModifiedBy : undefined;
      return own ?? meta.defaultUser ?? this.defaultUser;
    }
    return this.defaultUser;
  }

  private toFs(aemPath: string): string {
    const full = resolve(this.rootDir, `.${aemPath}`);
    const rel = relative(this.rootDir, full);
    if (isAbsolute(rel) || rel.split(sep).includes('..')) throw new InvalidAemPathError(aemPath);
    return full;
  }

  private async readDir(dir: string, folderPath: string): Promise<Dirent[]> {
    try {
      return await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (isNodeError(err) && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
        throw new FolderNotFoundError(folderPath);
      }
      throw err;
    }
  }

  private async readJson<T>(file: string): Promise<T | null> {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') return null;
      throw err;
    }
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed !== null && typeof parsed === 'object' ? (parsed as T) : null;
    } catch {
      this.logger?.warn(`MockAemClient: ignoring malformed JSON in ${relative(this.rootDir, file)}`);
      return null;
    }
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
