import { folderFailing } from '@launchdeck/shared';
import type { Campaign, FolderHealth } from '@launchdeck/shared';
import type { StreamStatus } from './sse.ts';
import { formatRelative } from './time.ts';

export type FolderRowKind = 'ok' | 'error' | 'pending';

export interface FolderRowStatus {
  kind: FolderRowKind;
  /** Uppercase track value, e.g. "OK · 2 MIN AGO". */
  value: string;
  /** Timestamp the value refers to (for the exact-time title), if any. */
  at: string | null;
}

/** Track label for a folder: its last path segment, uppercased. */
export function folderLabel(path: string): string {
  return (path.split('/').filter(Boolean).pop() ?? path).toUpperCase();
}

export function folderRowStatus(f: FolderHealth, now: number = Date.now()): FolderRowStatus {
  if (folderFailing(f)) {
    return { kind: 'error', value: `ERROR · ${formatRelative(f.lastErrorAt, now).toUpperCase()}`, at: f.lastErrorAt };
  }
  if (f.lastSuccessAt) {
    return { kind: 'ok', value: `OK · ${formatRelative(f.lastSuccessAt, now).toUpperCase()}`, at: f.lastSuccessAt };
  }
  return { kind: 'pending', value: 'NOT POLLED YET', at: null };
}

export const STREAM_LABEL: Record<StreamStatus, string> = {
  open: 'LIVE',
  connecting: 'CONNECTING',
  reconnecting: 'RECONNECTING',
};

/**
 * Campaign to select when a watcher folder row is clicked. A folder can be bound to several
 * campaigns: repeated clicks cycle through them, starting after the current selection.
 */
export function campaignForFolder(
  campaigns: readonly Pick<Campaign, 'id' | 'folders'>[],
  folderPath: string,
  selectedId: string | null,
): string | null {
  const owners = campaigns.filter((c) => c.folders.includes(folderPath));
  if (owners.length === 0) return null;
  const i = owners.findIndex((c) => c.id === selectedId);
  return owners[(i + 1) % owners.length]?.id ?? null;
}
