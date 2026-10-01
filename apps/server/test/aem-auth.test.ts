import { createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  JWT_LIFETIME_SEC,
  basicAuth,
  devTokenAuth,
  lifetimeMs,
  parseServiceCredentials,
  readServiceCredentials,
  serviceAuth,
} from '../src/aem/auth/index.ts';
import { createAemHttp } from '../src/aem/http.ts';
import { captureLog, json, recordingFetch, serviceCredentialsJson, throwawayKeys } from './aem-stub.ts';

const keys = throwawayKeys();
const credentials = parseServiceCredentials(serviceCredentialsJson(keys.privateKey));
const IMS_URL = 'https://ims-na1.adobelogin.com/ims/exchange/jwt';
const DAY_MS = 86_399_999;

const decode = (part: string): Record<string, unknown> => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

function imsFetch(lifetime = DAY_MS) {
  let n = 0;
  return recordingFetch(async () => {
    n++;
    return json({ token_type: 'bearer', access_token: `ims-access-token-${n}`, expires_in: lifetime });
  });
}

describe('static auth', () => {
  it('devtoken → Bearer', async () => {
    const auth = devTokenAuth('abc.def ');
    expect(await auth.header()).toBe('Bearer abc.def');
    expect(auth.refreshable).toBe(false);
  });

  it('basic → Basic base64(user:pass)', async () => {
    const auth = basicAuth('admin', 'p:ss wörd');
    expect(await auth.header()).toBe(`Basic ${Buffer.from('admin:p:ss wörd').toString('base64')}`);
  });
});

describe('service auth', () => {
  it('POSTs a form to IMS with a verifiable RS256 JWT carrying the expected claims', async () => {
    const { fetchImpl, calls } = imsFetch();
    const now = Date.parse('2026-10-01T10:00:00Z');
    const auth = serviceAuth({ credentials, fetchImpl, now: () => now });
    expect(await auth.header()).toBe('Bearer ims-access-token-1');

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(IMS_URL);
    expect(call.method).toBe('POST');
    expect(call.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(call.body ?? '');
    expect(form.get('client_id')).toBe('client-id-123');
    expect(form.get('client_secret')).toBe('p8e-CLIENT-SECRET-value');

    const jwt = form.get('jwt_token') ?? '';
    const [h, p, s] = jwt.split('.') as [string, string, string];
    expect(decode(h)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(p)).toEqual({
      exp: now / 1000 + JWT_LIFETIME_SEC,
      iss: 'ORG123@AdobeOrg',
      sub: 'TECHACCT@techacct.adobe.com',
      aud: 'https://ims-na1.adobelogin.com/c/client-id-123',
      'https://ims-na1.adobelogin.com/s/ent_aem_cloud_api': true,
      'https://ims-na1.adobelogin.com/s/ent_cloudmgr_sdk': true,
    });
    const ok = verify('sha256', Buffer.from(`${h}.${p}`), createPublicKey(keys.publicKey), Buffer.from(s, 'base64url'));
    expect(ok).toBe(true);
  });

  it('caches the token and refreshes 5 minutes before expiry', async () => {
    const { fetchImpl, calls } = imsFetch(3_600_000); // 1 h, in ms
    let now = 0;
    const auth = serviceAuth({ credentials, fetchImpl, now: () => now });
    await auth.header();
    now = 54 * 60_000;
    expect(await auth.header()).toBe('Bearer ims-access-token-1');
    expect(calls).toHaveLength(1);
    now = 55 * 60_000;
    expect(await auth.header()).toBe('Bearer ims-access-token-2');
    expect(calls).toHaveLength(2);
  });

  it('single-flights concurrent refreshes', async () => {
    const { fetchImpl, calls } = imsFetch();
    const auth = serviceAuth({ credentials, fetchImpl });
    const headers = await Promise.all(Array.from({ length: 8 }, () => auth.header()));
    expect(new Set(headers)).toEqual(new Set(['Bearer ims-access-token-1']));
    expect(calls).toHaveLength(1);
  });

  it('invalidate() forces a new exchange', async () => {
    const { fetchImpl, calls } = imsFetch();
    const auth = serviceAuth({ credentials, fetchImpl });
    await auth.header();
    auth.invalidate();
    expect(await auth.header()).toBe('Bearer ims-access-token-2');
    expect(calls).toHaveLength(2);
  });

  it('treats expires_in as ms, with a guard for second values', () => {
    expect(lifetimeMs(86_399_999)).toBe(86_399_999);
    expect(lifetimeMs(86_399)).toBe(86_399_000);
  });

  it('on a 401 from AEM: invalidates, re-exchanges and retries once; IMS gets the only POST', async () => {
    let aemCalls = 0;
    const { fetchImpl, calls } = recordingFetch(async (url) => {
      if (url === IMS_URL) return json({ access_token: `tok-${calls.length}`, expires_in: DAY_MS });
      aemCalls++;
      return aemCalls === 1 ? json({}, 401) : json({ ok: true });
    });
    const auth = serviceAuth({ credentials, fetchImpl });
    const http = createAemHttp({ host: 'https://author.example.com', auth, fetchImpl, sleep: async () => {} });
    await expect(http.getJson('/api/assets.json')).resolves.toEqual({ ok: true });
    expect(calls.map((c) => [c.method, new URL(c.url).host])).toEqual([
      ['POST', 'ims-na1.adobelogin.com'],
      ['GET', 'author.example.com'],
      ['POST', 'ims-na1.adobelogin.com'],
      ['GET', 'author.example.com'],
    ]);
    expect(calls[3]?.headers.get('authorization')).toBe('Bearer tok-3');
    expect(calls.filter((c) => c.method !== 'GET').every((c) => c.url === IMS_URL)).toBe(true);
  });

  it('IMS failures are masked', async () => {
    const { fetchImpl } = recordingFetch(async () =>
      json({ error: 'invalid_client', error_description: 'client p8e-CLIENT-SECRET-value bad' }, 400),
    );
    const err = (await serviceAuth({ credentials, fetchImpl }).header().catch((e: unknown) => e)) as Error;
    expect(err.message).toBe('IMS token exchange failed (HTTP 400: invalid_client)');

    const weird = recordingFetch(async () => json({ token: 'x' }));
    await expect(serviceAuth({ credentials, fetchImpl: weird.fetchImpl }).header()).rejects.toThrow(
      'IMS token exchange returned an unexpected response',
    );
  });
});

describe('service credentials file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ld-creds-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reads a valid file', () => {
    const file = join(dir, 'ok.json');
    writeFileSync(file, serviceCredentialsJson(keys.privateKey));
    expect(readServiceCredentials(file).integration.clientId).toBe('client-id-123');
  });

  it('names missing fields without echoing values', () => {
    const text = serviceCredentialsJson(keys.privateKey, { technicalAccount: { clientId: 'cid-VALUE' }, org: 42 });
    const err = (() => {
      try {
        parseServiceCredentials(text);
      } catch (e) {
        return e as Error;
      }
      return new Error('no throw');
    })();
    expect(err.message).toContain('integration.technicalAccount.clientSecret');
    expect(err.message).toContain('integration.org');
    expect(err.message).not.toContain('cid-VALUE');
    expect(err.message).not.toContain('PRIVATE KEY');
  });

  it('rejects bad PEM, bad JSON and unreadable files without echoing', () => {
    expect(() => parseServiceCredentials(serviceCredentialsJson('-----BEGIN PRIVATE KEY-----\nSECRETPEM\n'))).toThrow(
      'integration.privateKey is not a valid PEM private key',
    );
    expect(() => parseServiceCredentials('{ "integration": SECRET')).toThrow('Service credentials file is not valid JSON');
    expect(() => readServiceCredentials(join(dir, 'missing.json'))).toThrow(
      'AEM_SERVICE_CREDENTIALS_PATH: the service credentials file could not be read',
    );
  });
});

describe('redaction across auth flows', () => {
  it('never logs or throws secrets', async () => {
    const secrets = [
      'p8e-CLIENT-SECRET-value',
      keys.privateKey.split('\n')[1]!,
      'ims-access-token-1',
      'dev-SECRET-token',
      'hunter2-password',
    ];
    const { log, lines } = captureLog();
    const messages: string[] = [];
    const record = (p: Promise<unknown>) => p.catch((e: unknown) => messages.push((e as Error).message));

    const ims = imsFetch();
    const aemFetch = recordingFetch(async (url, init) =>
      url === IMS_URL ? ims.fetchImpl(url, init) : new Response(`echo ${new Headers(init.headers).get('authorization')}`, { status: 503 }),
    );
    const opts = { host: 'https://author.example.com', log, fetchImpl: aemFetch.fetchImpl, sleep: async () => {} };
    await record(createAemHttp({ ...opts, auth: serviceAuth({ credentials, fetchImpl: aemFetch.fetchImpl }) }).getJson('/a.json'));
    await record(createAemHttp({ ...opts, auth: devTokenAuth('dev-SECRET-token') }).getJson('/b.json'));
    await record(createAemHttp({ ...opts, auth: basicAuth('admin', 'hunter2-password') }).getJson('/c.json'));
    expect(messages).toEqual([
      'AEM 503 on /a.json after 5 attempts',
      'AEM 503 on /b.json after 5 attempts',
      'AEM 503 on /c.json after 5 attempts',
    ]);
    const text = [...lines, ...messages].join('\n');
    expect(lines.length).toBeGreaterThan(10);
    for (const s of [...secrets, Buffer.from('admin:hunter2-password').toString('base64')]) expect(text).not.toContain(s);
  });
});
