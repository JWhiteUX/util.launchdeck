import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DB_PATH: z.string().default('./data/launchdeck.db'),
  WATCH_INTERVAL_SEC: z.coerce.number().int().min(1).default(60),
  AEM_MODE: z.enum(['mock', 'live']).default('mock'),
  AEM_FIXTURES_DIR: z.string().default('./fixtures/aem'),
  AEM_FLAVOR: z.enum(['cloud', '65']).optional(),
  AEM_AUTH: z.enum(['devtoken', 'service', 'basic']).optional(),
  AEM_HOST: z.string().optional(),
  AEM_DEV_TOKEN: z.string().optional(),
  AEM_USERNAME: z.string().optional(),
  AEM_PASSWORD: z.string().optional(),
  AEM_SERVICE_CREDENTIALS_PATH: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const fromRoot = (p: string) => (p === ':memory:' ? p : resolve(repoRoot, p));

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env) {
    const envFile = resolve(repoRoot, '.env');
    try {
      if (existsSync(envFile)) process.loadEnvFile(envFile);
    } catch {
      // unreadable .env: fall back to defaults and the existing environment
    }
  }
  const blankToUndefined = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, v === '' ? undefined : v]),
  );
  const env = envSchema.parse(blankToUndefined);
  return { ...env, DB_PATH: fromRoot(env.DB_PATH), AEM_FIXTURES_DIR: fromRoot(env.AEM_FIXTURES_DIR) };
}
