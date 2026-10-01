import { describe, expect, it } from 'vitest';
import type { CampaignView } from '@launchdeck/shared';
import { actionsForMessage, dashboardReducer, initialDashboard } from './store.ts';

const c = (id: string, startDate: string, name = id): CampaignView => ({
  id,
  name,
  owner: 'jdoe',
  startDate,
  launchDate: '2026-12-01',
  status: 'planned',
  folders: ['/content/dam/a'],
  reviewedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  badge: 'green',
  badgeReason: 'ok',
  unreviewedCount: 0,
});

describe('dashboardReducer', () => {
  it('loads and sorts by start date', () => {
    const s = dashboardReducer(initialDashboard, { type: 'loaded', campaigns: [c('b', '2026-11-01'), c('a', '2026-10-01')] });
    expect(s.campaigns.map((x) => x.id)).toEqual(['a', 'b']);
    expect(s.loading).toBe(false);
  });

  it('upserts idempotently and removes', () => {
    let s = dashboardReducer(initialDashboard, { type: 'upsert', campaign: c('a', '2026-10-01') });
    s = dashboardReducer(s, { type: 'upsert', campaign: { ...c('a', '2026-10-01'), name: 'Renamed' } });
    expect(s.campaigns).toHaveLength(1);
    expect(s.campaigns[0]?.name).toBe('Renamed');
    s = dashboardReducer(s, { type: 'remove', id: 'a' });
    expect(s.campaigns).toEqual([]);
  });

  it('bumps change ticks per campaign', () => {
    let s = dashboardReducer(initialDashboard, { type: 'changed', campaignIds: ['a', 'b'] });
    s = dashboardReducer(s, { type: 'changed', campaignIds: ['a'] });
    expect(s.changeTicks).toEqual({ a: 2, b: 1 });
  });
});

describe('actionsForMessage', () => {
  it('refetches campaigns on change and health, not on campaign messages', () => {
    expect(actionsForMessage({ type: 'change', events: [], campaignIds: ['a'] }).refetchCampaigns).toBe(true);
    expect(
      actionsForMessage({ type: 'health', health: { intervalSec: 60, lastTickAt: null, nextTickAt: null, folders: [] } })
        .refetchCampaigns,
    ).toBe(true);
    expect(actionsForMessage({ type: 'campaign', action: 'deleted', id: 'a' })).toEqual({
      actions: [{ type: 'remove', id: 'a' }],
      refetchCampaigns: false,
    });
  });
});
