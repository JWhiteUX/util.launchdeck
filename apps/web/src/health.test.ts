import { describe, expect, it } from 'vitest';
import type { FolderHealth } from '@launchdeck/shared';
import { STREAM_LABEL, folderLabel, folderRowStatus } from './health.ts';

const now = Date.parse('2026-10-01T12:00:00.000Z');
const folder = (over: Partial<FolderHealth> = {}): FolderHealth => ({
  folderPath: '/content/dam/acme/fall-launch',
  lastPollAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastErrorAt: null,
  auditReadable: null,
  assetCount: null,
  ...over,
});

describe('folderLabel', () => {
  it('uses the last path segment, uppercased', () => {
    expect(folderLabel('/content/dam/acme/fall-launch')).toBe('FALL-LAUNCH');
    expect(folderLabel('/content/dam/acme/holiday/')).toBe('HOLIDAY');
  });
});

describe('folderRowStatus', () => {
  it('never polled → pending', () => {
    expect(folderRowStatus(folder(), now)).toEqual({ kind: 'pending', value: 'NOT POLLED YET', at: null });
  });

  it('ok with relative time of the last success', () => {
    const at = '2026-10-01T11:58:00.000Z';
    expect(folderRowStatus(folder({ lastPollAt: at, lastSuccessAt: at }), now)).toEqual({
      kind: 'ok',
      value: 'OK · 2 MIN AGO',
      at,
    });
  });

  it('error when the latest error is newer than the latest success', () => {
    const s = folderRowStatus(
      folder({
        lastSuccessAt: '2026-10-01T11:00:00.000Z',
        lastErrorAt: '2026-10-01T11:59:50.000Z',
        lastError: 'AEM returned 503',
      }),
      now,
    );
    expect(s).toEqual({ kind: 'error', value: 'ERROR · JUST NOW', at: '2026-10-01T11:59:50.000Z' });
  });

  it('error with no success ever', () => {
    expect(folderRowStatus(folder({ lastErrorAt: '2026-10-01T09:00:00.000Z' }), now).value).toBe('ERROR · 3 H AGO');
  });

  it('recovered folder (success after error) is ok', () => {
    const s = folderRowStatus(
      folder({ lastErrorAt: '2026-10-01T11:00:00.000Z', lastSuccessAt: '2026-10-01T11:30:00.000Z' }),
      now,
    );
    expect(s.kind).toBe('ok');
    expect(s.value).toBe('OK · 30 MIN AGO');
  });
});

describe('STREAM_LABEL', () => {
  it('names each stream state', () => {
    expect(STREAM_LABEL).toEqual({ open: 'LIVE', connecting: 'CONNECTING', reconnecting: 'RECONNECTING' });
  });
});
