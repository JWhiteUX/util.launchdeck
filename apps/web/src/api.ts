import type { ApiError, Campaign } from '@launchdeck/shared';

/** Fetch JSON from the API. Throws an Error carrying the server's ApiError message on non-2xx. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const body = (await res.json()) as Partial<ApiError>;
      if (typeof body.error === 'string' && body.error) message = body.error;
    } catch {
      // Non-JSON error body; keep the status message.
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function listCampaigns(signal?: AbortSignal): Promise<Campaign[]> {
  return request<Campaign[]>('/api/campaigns', signal ? { signal } : undefined);
}
