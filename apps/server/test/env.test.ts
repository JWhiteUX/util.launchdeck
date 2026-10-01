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
