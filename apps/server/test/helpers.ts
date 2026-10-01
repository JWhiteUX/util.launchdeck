import { vi } from 'vitest';
import type { CampaignInput } from '@launchdeck/shared';
import type { AemClient } from '../src/aem/AemClient.ts';
import { buildApp } from '../src/app.ts';
import type { BuildAppOptions } from '../src/app.ts';
import type { WatcherLog } from '../src/watcher/types.ts';

export const validInput: CampaignInput = {
  name: 'Fall launch',
  owner: 'jdoe',
  startDate: '2026-10-01',
  launchDate: '2026-10-20',
  status: 'planned',
  folders: ['/content/dam/brand/fall-launch', '/content/dam/brand/assets'],
};

/** AEM with every folder present and empty: polls succeed and never emit events. */
export const emptyAem = (): AemClient => ({
  listFolder: async (path) => ({ path, folders: [], assets: [] }),
  queryChangedAssets: async () => [],
  listAllAssets: async () => [],
  queryAuditEvents: async () => [],
});

export function spyLog() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } satisfies WatcherLog;
}

export function testApp(opts: Partial<BuildAppOptions> = {}) {
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 8, 30, 12, 0, tick++)).toISOString();
  return buildApp({ dbPath: ':memory:', now, aemClient: emptyAem(), ...opts });
}

/** UTC YYYY-MM-DD `days` from today. */
export const dateFromToday = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
