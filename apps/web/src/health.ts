import { folderFailing } from '@launchdeck/shared';
import type { FolderHealth } from '@launchdeck/shared';
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
