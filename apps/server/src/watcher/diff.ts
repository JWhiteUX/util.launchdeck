import type { AssetHit } from '../aem/AemClient.ts';
import type { DiffResult, SnapshotEntry } from './types.ts';

const byPath = (a: { path: string }, b: { path: string }): number =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

function indexByPath<T extends { path: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.path, item);
  return map;
}

/** Same instant? Falls back to string equality when either side is unparseable. */
export function sameInstant(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return ta === tb;
}

export function diffSnapshots(prev: readonly SnapshotEntry[], current: readonly AssetHit[]): DiffResult {
  const before = indexByPath(prev);
  const after = indexByPath(current);
  const added: AssetHit[] = [];
  const modified: AssetHit[] = [];
  const deleted: SnapshotEntry[] = [];

  for (const [path, hit] of after) {
    const old = before.get(path);
    if (!old) added.push(hit);
    else if (!sameInstant(old.lastModified, hit.lastModified)) modified.push(hit);
  }
  for (const [path, entry] of before) {
    if (!after.has(path)) deleted.push(entry);
  }

  return { added: added.sort(byPath), modified: modified.sort(byPath), deleted: deleted.sort(byPath) };
}

/**
 * Overlay the fresher daterange hits onto the full listing. Hits only in `changed`
 * (created between the two queries) are included. Result is sorted by path.
 */
export function mergeChangedHits(full: readonly AssetHit[], changed: readonly AssetHit[]): AssetHit[] {
  const merged = indexByPath(full);
  for (const hit of changed) merged.set(hit.path, hit);
  return [...merged.values()].sort(byPath);
}
