import { afterEach, describe, expect, it } from 'vitest';
import { devTokenAuth } from '../src/aem/auth/devtoken.ts';
import type { AuthProvider } from '../src/aem/auth/types.ts';
import { AemAuthError, AemForbiddenError, AemHttpError, AemNotFoundError } from '../src/aem/errors.ts';
import { parseAemHost } from '../src/aem/host.ts';
import { backoffDelay, createAemHttp, parseRetryAfter } from '../src/aem/http.ts';
import type { AemHttpOptions } from '../src/aem/http.ts';
import type { AemStub } from './aem-stub.ts';
import { captureLog, json, recordingFetch, startAemStub } from './aem-stub.ts';

const HOST = 'https://author-p1-e2.adobeaemcloud.com';
const TOKEN = 'dev-token-SHOULD-NOT-LEAK';

function setup(responses: (Response | Error)[], opts: Partial<AemHttpOptions> = {}) {
  const queue = [...responses];
  const { fetchImpl, calls } = recordingFetch(() => {
    const next = queue.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
  const delays: number[] = [];
  const { log, lines } = captureLog();
  const http = createAemHttp({
    host: HOST,
    auth: devTokenAuth(TOKEN),
    log,
    fetchImpl,
    sleep: async (ms) => {
      delays.push(ms);
    },
    random: () => 0.5,
    ...opts,
  });
  return { http, calls, delays, lines };
}

let stub: AemStub | null = null;
afterEach(async () => {
  await stub?.close();
  stub = null;
});

describe('createAemHttp: GET only', () => {
  it('sends every request as GET with auth + accept headers and an abort signal', async () => {
    const { http, calls } = setup([json({ a: 1 }), json({ b: 2 })]);
    await expect(http.getJson('/api/assets.json', { limit: 1 })).resolves.toEqual({ a: 1 });
    await http.getJson('/bin/querybuilder.json', { path: '/content/dam/x y', 'p.limit': -1 });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET']);
    expect(calls[0]?.url).toBe(`${HOST}/api/assets.json?limit=1`);
    expect(calls[1]?.url).toBe(`${HOST}/bin/querybuilder.json?path=%2Fcontent%2Fdam%2Fx+y&p.limit=-1`);
    expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.headers.get('accept')).toBe('application/json');
  });

  it('exposes no way to pick a method', () => {
    const { http } = setup([]);
    expect(Object.keys(http).sort()).toEqual(['baseUrl', 'getJson']);
    expect(http.getJson.length).toBeLessThanOrEqual(2);
  });

  it('only GETs reach a stub AEM that rejects other methods', async () => {
    stub = await startAemStub({ authorization: `Bearer ${TOKEN}` });
    const http = createAemHttp({ host: stub.url, auth: devTokenAuth(TOKEN) });
    await http.getJson('/api/assets.json');
    await http.getJson('/bin/querybuilder.json', { path: '/content/dam', type: 'dam:Asset' });
    await http.getJson('/var/audit/com.day.cq.dam.json');
    expect(stub.state.requests.length).toBe(3);
    expect(stub.state.requests.every((r) => r.method === 'GET')).toBe(true);
  });

  it('encodes path segments', async () => {
    const { http, calls } = setup([json({})]);
    await http.getJson('/api/assets/brand/fall launch/ü.json');
    expect(calls[0]?.url).toBe(`${HOST}/api/assets/brand/fall%20launch/%C3%BC.json`);
  });
});

describe('createAemHttp: retries', () => {
  it('retries 429 then succeeds', async () => {
    const { http, calls, delays } = setup([json({}, 429), json({ ok: true })]);
    await expect(http.getJson('/bin/querybuilder.json')).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(delays).toEqual([375]); // base 500 with equal jitter at random()=0.5
  });

  it('gives up after 5 attempts with a body-free error and exponential delays', async () => {
    const body = 'SECRET-BODY-CONTENT';
    const { http, calls, delays } = setup(Array.from({ length: 5 }, () => new Response(body, { status: 503 })));
    const err = await http.getJson('/bin/querybuilder.json', { path: '/content/dam/a' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AemHttpError);
    expect((err as AemHttpError).message).toBe('AEM 503 on /bin/querybuilder.json after 5 attempts');
    expect((err as AemHttpError).status).toBe(503);
    expect(calls).toHaveLength(5);
    expect(delays).toEqual([375, 750, 1500, 3000]);
  });

  it('honours Retry-After seconds and HTTP-date, capped at 30 s', async () => {
    const now = Date.parse('2026-10-01T10:00:00Z');
    const { http, delays } = setup(
      [
        json({}, 429, { 'retry-after': '2' }),
        json({}, 503, { 'retry-after': new Date(now + 7000).toUTCString() }),
        json({}, 429, { 'retry-after': '120' }),
        json({ done: 1 }),
      ],
      { now: () => now },
    );
    await expect(http.getJson('/x.json')).resolves.toEqual({ done: 1 });
    expect(delays).toEqual([2000, 7000, 30_000]);
  });

  it.each([400, 404, 405, 302])('does not retry %i', async (status) => {
    const { http, calls } = setup([new Response('', { status })]);
    const err = await http.getJson('/api/assets/x.json').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AemHttpError);
    expect((err as Error).message).toBe(`AEM ${status} on /api/assets/x.json`);
    expect(calls).toHaveLength(1);
  });

  it('maps 401/403/404 to typed errors', async () => {
    const { http } = setup([json({}, 401), json({}, 403), json({}, 404)]);
    await expect(http.getJson('/a.json')).rejects.toBeInstanceOf(AemAuthError);
    await expect(http.getJson('/a.json')).rejects.toBeInstanceOf(AemForbiddenError);
    await expect(http.getJson('/a.json')).rejects.toBeInstanceOf(AemNotFoundError);
  });

  it('retries network errors and timeouts', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const { http, calls } = setup([new TypeError('fetch failed'), timeout, json({ ok: 1 })]);
    await expect(http.getJson('/a.json')).resolves.toEqual({ ok: 1 });
    expect(calls).toHaveLength(3);
    const all = setup(Array.from({ length: 5 }, () => timeout));
    await expect(all.http.getJson('/a.json')).rejects.toThrow('AEM timeout on /a.json after 5 attempts');
  });

  it('aborts slow requests with the configured timeout', async () => {
    stub = await startAemStub({ authorization: `Bearer ${TOKEN}`, delayMs: 300 });
    const http = createAemHttp({
      host: stub.url,
      auth: devTokenAuth(TOKEN),
      timeoutMs: 50,
      maxAttempts: 2,
      sleep: async () => {},
    });
    await expect(http.getJson('/api/assets.json')).rejects.toThrow('AEM timeout on /api/assets.json after 2 attempts');
  });

  it('rejects invalid JSON without echoing the body', async () => {
    const { http } = setup([new Response('<html>login SECRET</html>', { status: 200 })]);
    const err = (await http.getJson('/a.json').catch((e: unknown) => e)) as Error;
    expect(err.message).toBe('AEM returned invalid JSON on /a.json');
  });

  it('backoff and Retry-After helpers', () => {
    expect(backoffDelay(1, 500, () => 0)).toBe(250);
    expect(backoffDelay(1, 500, () => 1)).toBe(500);
    expect(backoffDelay(10, 500, () => 1)).toBe(30_000);
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter('soon', 0)).toBeNull();
    expect(parseRetryAfter('3', 0)).toBe(3000);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:05 GMT', 1000)).toBe(4000);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:05 GMT', 9000)).toBe(0);
  });
});

describe('createAemHttp: 401 refresh', () => {
  function refreshable(): AuthProvider & { invalidations: number } {
    let n = 0;
    const p = {
      kind: 'service' as const,
      refreshable: true,
      invalidations: 0,
      header: async () => `Bearer token-${n}`,
      invalidate: () => {
        n++;
        p.invalidations++;
      },
    };
    return p;
  }

  it('invalidates and retries exactly once with a fresh token', async () => {
    const auth = refreshable();
    const { http, calls } = setup([json({}, 401), json({ ok: 1 })], { auth });
    await expect(http.getJson('/a.json')).resolves.toEqual({ ok: 1 });
    expect(auth.invalidations).toBe(1);
    expect(calls.map((c) => c.headers.get('authorization'))).toEqual(['Bearer token-0', 'Bearer token-1']);

    const again = setup([json({}, 401), json({}, 401), json({ never: 1 })], { auth: refreshable() });
    await expect(again.http.getJson('/a.json')).rejects.toBeInstanceOf(AemAuthError);
    expect(again.calls).toHaveLength(2);
  });

  it('does not retry 401 for static credentials', async () => {
    const { http, calls } = setup([json({}, 401), json({ ok: 1 })]);
    await expect(http.getJson('/a.json')).rejects.toBeInstanceOf(AemAuthError);
    expect(calls).toHaveLength(1);
  });
});

describe('createAemHttp: concurrency', () => {
  it('never has more than 4 requests in flight at the stub', async () => {
    stub = await startAemStub({ authorization: `Bearer ${TOKEN}`, delayMs: 30 });
    const http = createAemHttp({ host: stub.url, auth: devTokenAuth(TOKEN) });
    await Promise.all(Array.from({ length: 10 }, () => http.getJson('/api/assets.json')));
    expect(stub.state.requests).toHaveLength(10);
    expect(stub.state.maxInFlight).toBe(4);
  });
});

describe('createAemHttp: logging', () => {
  it('logs method, path, status, attempt and duration, never the token or body', async () => {
    const { http, lines } = setup([new Response('BODY-SECRET', { status: 503 }), json({ answer: 'BODY-OK' })]);
    await http.getJson('/bin/querybuilder.json', { path: '/content/dam/a' });
    const text = lines.join('\n');
    expect(text).toContain('"method":"GET"');
    expect(text).toContain('"path":"/bin/querybuilder.json"');
    expect(text).toContain('"status":503');
    expect(text).toContain('"attempt":1');
    expect(text).toMatch(/"ms":\d+/);
    for (const secret of [TOKEN, 'BODY-SECRET', 'BODY-OK', 'authorization', 'Bearer']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('parseAemHost', () => {
  it('accepts https and local http, strips the trailing slash', () => {
    expect(parseAemHost('https://author.example.com/')).toBe('https://author.example.com');
    expect(parseAemHost('http://localhost:4502')).toBe('http://localhost:4502');
    expect(parseAemHost('http://127.0.0.1:4502/')).toBe('http://127.0.0.1:4502');
  });

  it.each(['http://author.example.com', 'ftp://x', 'not a url', 'https://user:pw@x.com', 'https://x.com/?a=1'])(
    'rejects %s without echoing it',
    (raw) => {
      let message = '';
      try {
        parseAemHost(raw);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toMatch(/^AEM_HOST/);
      expect(message).not.toContain(raw);
      expect(message).not.toContain('pw');
    },
  );
});
