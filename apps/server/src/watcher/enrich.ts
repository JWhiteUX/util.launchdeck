import type { ChangeEventType } from '@launchdeck/shared';
import type { AuditEvent } from '../aem/AemClient.ts';
import type { DiffResult, PendingChange } from './types.ts';

export const DEFAULT_MATCH_WINDOW_MS = 10 * 60 * 1000;

export interface EnrichOptions {
  /** Max |audit time - jcr lastModified| for ADDED/MODIFIED matches. Default 10 min. */
  matchWindowMs?: number;
}

const ADDED_TYPES = new Set(['ASSET_CREATED', 'ASSET_UPLOADED']);
const DELETED_TYPES = new Set(['ASSET_REMOVED', 'ASSET_DELETED']);

/** Unknown audit types are treated as modifications. */
export function isCompatible(change: ChangeEventType, auditType: string): boolean {
  if (change === 'ADDED') return ADDED_TYPES.has(auditType);
  if (change === 'DELETED') return DELETED_TYPES.has(auditType);
  return !ADDED_TYPES.has(auditType) && !DELETED_TYPES.has(auditType);
}

export function assetNameOf(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

function pickEvent(
  change: PendingChange,
  candidates: readonly AuditEvent[],
  used: ReadonlySet<AuditEvent>,
  windowMs: number,
): AuditEvent | null {
  const target = Date.parse(change.occurredAt);
  let best: AuditEvent | null = null;
  let bestScore = Infinity;
  for (const event of candidates) {
    if (used.has(event) || event.path !== change.assetPath || !isCompatible(change.type, event.type)) continue;
    const t = Date.parse(event.time);
    if (Number.isNaN(t)) continue;
    let score: number;
    if (change.type === 'DELETED') {
      score = -t;
    } else {
      if (Number.isNaN(target)) continue;
      score = Math.abs(t - target);
      if (score > windowMs) continue;
    }
    if (score < bestScore) {
      best = event;
      bestScore = score;
    }
  }
  return best;
}

function compareChanges(a: PendingChange, b: PendingChange): number {
  const ta = Date.parse(a.occurredAt);
  const tb = Date.parse(b.occurredAt);
  if (ta !== tb && !Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  if (a.assetPath !== b.assetPath) return a.assetPath < b.assetPath ? -1 : 1;
  return 0;
}

/**
 * Turn a snapshot diff into pending change events. `auditEvents = null` means the
 * audit log was unavailable: users come from jcr:lastModifiedBy. Deletes use
 * `detectedAt` and no user unless an audit event attributes them.
 */
export function toPendingChanges(
  folderPath: string,
  diff: DiffResult,
  auditEvents: readonly AuditEvent[] | null,
  detectedAt: string,
  opts: EnrichOptions = {},
): PendingChange[] {
  const windowMs = opts.matchWindowMs ?? DEFAULT_MATCH_WINDOW_MS;
  const base = (
    type: ChangeEventType,
    path: string,
    format: string | null,
    user: string | null,
    occurredAt: string,
  ): PendingChange => ({
    folderPath,
    assetPath: path,
    assetName: assetNameOf(path),
    type,
    format,
    user,
    userSource: 'jcr',
    occurredAt,
  });

  const changes: PendingChange[] = [
    ...diff.added.map((h) => base('ADDED', h.path, h.format, h.lastModifiedBy, h.lastModified)),
    ...diff.modified.map((h) => base('MODIFIED', h.path, h.format, h.lastModifiedBy, h.lastModified)),
    ...diff.deleted.map((e) => base('DELETED', e.path, e.format, null, detectedAt)),
  ];

  if (!auditEvents) return changes.sort(compareChanges);

  const used = new Set<AuditEvent>();
  const enriched = changes.map((change): PendingChange => {
    const event = pickEvent(change, auditEvents, used, windowMs);
    if (!event) return change;
    used.add(event);
    return { ...change, user: event.userId, occurredAt: event.time, userSource: 'audit' };
  });
  return enriched.sort(compareChanges);
}
