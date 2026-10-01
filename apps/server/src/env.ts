import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import { liveEnvIssues } from './aem/config.ts';

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const envSchema = z
  .object({
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
    AEM_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).optional(),
    AEM_SMOKE_FOLDER: z.string().default('/content/dam'),
  })
  .superRefine((env, ctx) => {
    if (env.AEM_MODE !== 'live') return;
    for (const issue of liveEnvIssues(env)) ctx.addIssue({ code: 'custom', path: [issue.key], message: issue.message });
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
  const parsed = envSchema.safeParse(blankToUndefined);
  if (!parsed.success) throw new Error(`Invalid environment:\n${formatIssues(parsed.error.issues)}`);
  const env = parsed.data;
  return { ...env, DB_PATH: fromRoot(env.DB_PATH), AEM_FIXTURES_DIR: fromRoot(env.AEM_FIXTURES_DIR) };
}

/** One line per issue, naming the key. Zod issue messages here never include input values. */
function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((i) => {
      const key = i.path.join('.') || '(root)';
      return i.message.startsWith(key) ? `- ${i.message}` : `- ${key}: ${i.message}`;
    })
    .join('\n');
}
