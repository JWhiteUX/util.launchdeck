import type {
  ApiError,
  CampaignInput,
  CampaignView,
  ChangeEvent,
  EventFacets,
  FolderListing,
  WatcherHealth,
} from '@launchdeck/shared';

/** Error from a non-2xx response. `issues` carries server-side validation details. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues: ApiError['issues'] = [],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** Fetch JSON from the API. Throws ApiRequestError carrying the server's ApiError on non-2xx. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    let issues: ApiError['issues'] = [];
    try {
      const body = (await res.json()) as Partial<ApiError>;
      if (typeof body.error === 'string' && body.error) message = body.error;
      if (Array.isArray(body.issues)) issues = body.issues;
    } catch {
      // Non-JSON error body; keep the status message.
    }
    throw new ApiRequestError(message, res.status, issues);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({
  method,
  body: JSON.stringify(body),
  ...(signal ? { signal } : {}),
});
const opt = (signal?: AbortSignal): RequestInit | undefined => (signal ? { signal } : undefined);

export const api = {
  listCampaigns: (signal?: AbortSignal) => request<CampaignView[]>('/api/campaigns', opt(signal)),
  getCampaign: (id: string, signal?: AbortSignal) =>
    request<CampaignView>(`/api/campaigns/${encodeURIComponent(id)}`, opt(signal)),
  createCampaign: (input: CampaignInput) => request<CampaignView>('/api/campaigns', json('POST', input)),
  updateCampaign: (id: string, input: CampaignInput) =>
    request<CampaignView>(`/api/campaigns/${encodeURIComponent(id)}`, json('PUT', input)),
  deleteCampaign: (id: string) =>
    request<void>(`/api/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  markReviewed: (id: string) =>
    request<CampaignView>(`/api/campaigns/${encodeURIComponent(id)}/review`, { method: 'POST' }),

  listEvents: (id: string, filters: { user?: string; format?: string } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (filters.user) q.set('user', filters.user);
    if (filters.format) q.set('format', filters.format);
    const qs = q.size ? `?${q}` : '';
    return request<ChangeEvent[]>(`/api/campaigns/${encodeURIComponent(id)}/events${qs}`, opt(signal));
  },
  eventFacets: (id: string, signal?: AbortSignal) =>
    request<EventFacets>(`/api/campaigns/${encodeURIComponent(id)}/events/facets`, opt(signal)),

  watcherHealth: (signal?: AbortSignal) => request<WatcherHealth>('/api/watcher/health', opt(signal)),
  pollNow: () => request<unknown>('/api/watcher/poll', { method: 'POST' }),

  listFolder: (path: string, signal?: AbortSignal) =>
    request<FolderListing>(`/api/folders?path=${encodeURIComponent(path)}`, opt(signal)),
};

export type Api = typeof api;
