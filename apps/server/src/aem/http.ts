import { Semaphore, DEFAULT_CONCURRENCY } from '../watcher/semaphore.ts';
import type { AuthProvider } from './auth/types.ts';
import { AemAuthError, AemForbiddenError, AemHttpError, AemNotFoundError } from './errors.ts';
import { parseAemHost } from './host.ts';
import type { AemLog } from './log.ts';
import { silentLog } from './log.ts';

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_BASE_DELAY_MS = 500;
export const MAX_DELAY_MS = 30_000;
const LOGGED_QUERY_MAX = 120;

export type Query = Record<string, string | number>;

export interface AemHttpOptions {
  host: string;
  auth: AuthProvider;
  log?: AemLog;
  concurrency?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

/** Read-only HTTP access to AEM. There is deliberately no way to choose a method: every request is GET. */
export interface AemHttp {
  readonly baseUrl: string;
  getJson<T = unknown>(path: string, query?: Query): Promise<T>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const isRetryable = (status: number): boolean => status === 429 || status >= 500;

/** Retry-After as delay ms (delta-seconds or HTTP-date), or null when absent/invalid. */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}

/** Exponential backoff with equal jitter: half the step is fixed, half random. */
export function backoffDelay(attempt: number, baseMs: number, random: () => number): number {
  const step = baseMs * 2 ** (attempt - 1);
  return Math.min(MAX_DELAY_MS, step / 2 + (random() * step) / 2);
}

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

function errorFor(status: number, path: string, attempts: number): AemHttpError {
  if (status === 401) return new AemAuthError(status, path, attempts);
  if (status === 403) return new AemForbiddenError(status, path, attempts);
  if (status === 404) return new AemNotFoundError(status, path, attempts);
  return new AemHttpError(status, path, attempts);
}

/** Body-free description of a network failure: error name/code only. */
function networkDetail(err: unknown): string {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return 'timeout';
  const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : null;
  return code && /^[A-Z_]{2,40}$/.test(code) ? `network error (${code})` : 'network error';
}

export function createAemHttp(opts: AemHttpOptions): AemHttp {
  const baseUrl = parseAemHost(opts.host);
  const log = opts.log ?? silentLog;
  const semaphore = new Semaphore(opts.concurrency ?? DEFAULT_CONCURRENCY);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const now = opts.now ?? Date.now;

  function send(url: string, authorization: string): Promise<Response> {
    return fetchImpl(url, {
      method: 'GET',
      headers: { authorization, accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  async function getJson<T>(path: string, query: Query = {}): Promise<T> {
    if (!path.startsWith('/')) throw new Error('AEM request path must start with /');
    const search = new URLSearchParams(Object.entries(query).map(([k, v]): [string, string] => [k, String(v)])).toString();
    const url = `${baseUrl}${encodePath(path)}${search ? `?${search}` : ''}`;
    const logged = { method: 'GET', path, query: search.slice(0, LOGGED_QUERY_MAX) || undefined };
    let reauthed = false;

    for (let attempt = 1; ; attempt++) {
      const authorization = await opts.auth.header();
      const started = now();
      let res: Response;
      try {
        res = await semaphore.run(() => send(url, authorization));
      } catch (err) {
        const detail = networkDetail(err);
        const ms = now() - started;
        if (attempt >= maxAttempts) throw new AemHttpError(null, path, attempt, detail);
        const delayMs = backoffDelay(attempt, baseDelayMs, random);
        log.warn({ ...logged, status: null, attempt, ms, delayMs, error: detail }, 'AEM request failed; retrying');
        await sleep(delayMs);
        continue;
      }
      const ms = now() - started;
      log.debug({ ...logged, status: res.status, attempt, ms }, 'AEM request');

      if (res.ok) {
        try {
          return (await res.json()) as T;
        } catch {
          throw new AemHttpError(null, path, attempt, 'returned invalid JSON');
        }
      }
      await res.body?.cancel().catch(() => undefined);

      if (res.status === 401 && opts.auth.refreshable && !reauthed) {
        reauthed = true;
        opts.auth.invalidate();
        log.warn({ ...logged, status: 401, attempt }, 'AEM rejected the token; refreshing once');
        attempt--;
        continue;
      }
      if (!isRetryable(res.status) || attempt >= maxAttempts) throw errorFor(res.status, path, attempt);

      const retryAfter = parseRetryAfter(res.headers.get('retry-after'), now());
      const delayMs = Math.min(MAX_DELAY_MS, retryAfter ?? backoffDelay(attempt, baseDelayMs, random));
      log.warn({ ...logged, status: res.status, attempt, ms, delayMs }, 'AEM request throttled or failed; retrying');
      await sleep(delayMs);
    }
  }

  return { baseUrl, getJson };
}
