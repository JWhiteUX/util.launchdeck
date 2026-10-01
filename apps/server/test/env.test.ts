import { isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEnv, repoRoot } from '../src/env.ts';

describe('loadEnv', () => {
  it('applies defaults and resolves paths from the repo root', () => {
    const env = loadEnv({});
    expect(env).toMatchObject({ PORT: 4000, WATCH_INTERVAL_SEC: 60, AEM_MODE: 'mock' });
    expect(isAbsolute(env.DB_PATH)).toBe(true);
    expect(env.DB_PATH.startsWith(repoRoot)).toBe(true);
    expect(env.AEM_FIXTURES_DIR.endsWith('fixtures/aem')).toBe(true);
  });

  it('coerces numbers and keeps absolute paths', () => {
    const env = loadEnv({ PORT: '4011', DB_PATH: '/tmp/x.db', WATCH_INTERVAL_SEC: '5' });
    expect(env).toMatchObject({ PORT: 4011, DB_PATH: '/tmp/x.db', WATCH_INTERVAL_SEC: 5 });
  });

  it('rejects an invalid AEM_MODE', () => {
    expect(() => loadEnv({ AEM_MODE: 'prod' })).toThrow();
  });
});

describe('loadEnv: AEM_MODE=live', () => {
  const SECRET = 'S3CRET-value-xyz';
  const base = { AEM_MODE: 'live', AEM_HOST: 'https://author.example.com', AEM_FLAVOR: 'cloud' };

  function errorOf(source: NodeJS.ProcessEnv): string {
    try {
      loadEnv(source);
    } catch (err) {
      return (err as Error).message;
    }
    throw new Error('expected loadEnv to throw');
  }

  it.each([
    [{ AEM_MODE: 'live' }, ['AEM_HOST', 'AEM_FLAVOR', 'AEM_AUTH']],
    [{ ...base, AEM_HOST: `http://${SECRET}.example.com`, AEM_AUTH: 'devtoken', AEM_DEV_TOKEN: 'x' }, ['AEM_HOST must use https://']],
    [{ ...base, AEM_HOST: SECRET, AEM_AUTH: 'devtoken', AEM_DEV_TOKEN: 'x' }, ['AEM_HOST must be a URL']],
    [{ ...base, AEM_FLAVOR: SECRET, AEM_AUTH: 'devtoken', AEM_DEV_TOKEN: 'x' }, ['AEM_FLAVOR']],
    [{ ...base, AEM_AUTH: SECRET }, ['AEM_AUTH']],
    [{ ...base, AEM_AUTH: 'devtoken' }, ['AEM_DEV_TOKEN is required when AEM_AUTH=devtoken']],
    [{ ...base, AEM_AUTH: 'basic', AEM_USERNAME: SECRET }, ['AEM_PASSWORD is required when AEM_AUTH=basic']],
    [{ ...base, AEM_AUTH: 'basic', AEM_PASSWORD: SECRET }, ['AEM_USERNAME is required when AEM_AUTH=basic']],
    [{ ...base, AEM_AUTH: 'service' }, ['AEM_SERVICE_CREDENTIALS_PATH is required when AEM_AUTH=service']],
    [
      { ...base, AEM_FLAVOR: '65', AEM_AUTH: 'service', AEM_SERVICE_CREDENTIALS_PATH: `/tmp/${SECRET}.json` },
      ['AEM_AUTH=service is only supported with AEM_FLAVOR=cloud'],
    ],
    [{ ...base, AEM_AUTH: 'devtoken', AEM_DEV_TOKEN: SECRET, AEM_REQUEST_TIMEOUT_MS: '5' }, ['AEM_REQUEST_TIMEOUT_MS']],
  ])('rejects %o naming the key, not the value', (source, expected) => {
    const message = errorOf(source);
    for (const e of expected) expect(message).toContain(e);
    expect(message).not.toContain(SECRET);
  });

  it('accepts valid live combinations', () => {
    expect(loadEnv({ ...base, AEM_AUTH: 'devtoken', AEM_DEV_TOKEN: 'x' })).toMatchObject({ AEM_MODE: 'live' });
    expect(loadEnv({ ...base, AEM_FLAVOR: '65', AEM_AUTH: 'basic', AEM_USERNAME: 'u', AEM_PASSWORD: 'p' }).AEM_FLAVOR).toBe('65');
    const svc = loadEnv({ ...base, AEM_AUTH: 'service', AEM_SERVICE_CREDENTIALS_PATH: '/x.json', AEM_REQUEST_TIMEOUT_MS: '10000' });
    expect(svc.AEM_REQUEST_TIMEOUT_MS).toBe(10_000);
    expect(loadEnv({ ...base, AEM_HOST: 'http://localhost:4502', AEM_AUTH: 'basic', AEM_USERNAME: 'u', AEM_PASSWORD: 'p' }).AEM_HOST).toBe(
      'http://localhost:4502',
    );
  });

  it('does not validate live keys in mock mode', () => {
    expect(loadEnv({ AEM_MODE: 'mock', AEM_AUTH: 'service', AEM_FLAVOR: '65' }).AEM_MODE).toBe('mock');
  });
});
