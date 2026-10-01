import { useCallback, useEffect, useReducer } from 'react';
import type { CampaignView, StreamMessage, WatcherHealth } from '@launchdeck/shared';
import { api } from './api.ts';
import { useLiveStream } from './sse.ts';
import type { StreamStatus } from './sse.ts';

export interface DashboardState {
  campaigns: CampaignView[];
  health: WatcherHealth | null;
  loading: boolean;
  error: string | null;
  /** Bumped per campaign when new change events arrive; feeds refetch when it changes. */
  changeTicks: Record<string, number>;
}

export type DashboardAction =
  | { type: 'loaded'; campaigns: CampaignView[] }
  | { type: 'failed'; error: string }
  | { type: 'health'; health: WatcherHealth }
  | { type: 'upsert'; campaign: CampaignView }
  | { type: 'remove'; id: string }
  | { type: 'changed'; campaignIds: string[] };

export const initialDashboard: DashboardState = {
  campaigns: [],
  health: null,
  loading: true,
  error: null,
  changeTicks: {},
};

const byStart = (a: CampaignView, b: CampaignView) =>
  a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'loaded':
      return { ...state, campaigns: [...action.campaigns].sort(byStart), loading: false, error: null };
    case 'failed':
      return { ...state, loading: false, error: action.error };
    case 'health':
      return { ...state, health: action.health };
    case 'upsert': {
      const rest = state.campaigns.filter((c) => c.id !== action.campaign.id);
      return { ...state, campaigns: [...rest, action.campaign].sort(byStart) };
    }
    case 'remove':
      return { ...state, campaigns: state.campaigns.filter((c) => c.id !== action.id) };
    case 'changed': {
      const changeTicks = { ...state.changeTicks };
      for (const id of action.campaignIds) changeTicks[id] = (changeTicks[id] ?? 0) + 1;
      return { ...state, changeTicks };
    }
  }
}

/** Maps a stream message to reducer actions. Badges are server-computed, so change/health trigger a refetch. */
export function actionsForMessage(msg: StreamMessage): { actions: DashboardAction[]; refetchCampaigns: boolean } {
  switch (msg.type) {
    case 'campaign':
      return msg.action === 'deleted'
        ? { actions: [{ type: 'remove', id: msg.id }], refetchCampaigns: false }
        : { actions: [{ type: 'upsert', campaign: msg.campaign }], refetchCampaigns: false };
    case 'change':
      return { actions: [{ type: 'changed', campaignIds: msg.campaignIds }], refetchCampaigns: true };
    case 'health':
      return { actions: [{ type: 'health', health: msg.health }], refetchCampaigns: true };
  }
}

export interface Dashboard extends DashboardState {
  stream: StreamStatus;
  /** Apply a campaign returned from a mutation immediately (the stream echo is idempotent). */
  upsert: (campaign: CampaignView) => void;
  remove: (id: string) => void;
  refresh: () => void;
}

export function useDashboard(): Dashboard {
  const [state, dispatch] = useReducer(dashboardReducer, initialDashboard);

  const refresh = useCallback(() => {
    api.listCampaigns().then(
      (campaigns) => dispatch({ type: 'loaded', campaigns }),
      (err: unknown) => dispatch({ type: 'failed', error: err instanceof Error ? err.message : String(err) }),
    );
  }, []);

  useEffect(() => {
    refresh();
    api.watcherHealth().then(
      (health) => dispatch({ type: 'health', health }),
      () => {
        // Health arrives on the stream too; a failed first fetch is not fatal.
      },
    );
  }, [refresh]);

  const stream = useLiveStream((msg) => {
    const { actions, refetchCampaigns } = actionsForMessage(msg);
    for (const a of actions) dispatch(a);
    if (refetchCampaigns) refresh();
  });

  const upsert = useCallback((campaign: CampaignView) => dispatch({ type: 'upsert', campaign }), []);
  const remove = useCallback((id: string) => dispatch({ type: 'remove', id }), []);

  return { ...state, stream, upsert, remove, refresh };
}
