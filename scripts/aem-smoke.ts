// Live AEM smoke test: one folder listing + one QueryBuilder call, read-only (GET only).
// Usage: npx tsx scripts/aem-smoke.ts   (reads .env; requires AEM_MODE=live)
import { createHttpAemClient } from '../apps/server/src/aem/index.ts';
import { AemAuthError, AemForbiddenError, AemNotFoundError } from '../apps/server/src/aem/errors.ts';
import { FolderNotFoundError } from '../apps/server/src/aem/AemClient.ts';
import { parseAemHost } from '../apps/server/src/aem/host.ts';
import type { AemLog } from '../apps/server/src/aem/log.ts';
import { loadEnv } from '../apps/server/src/env.ts';
import type { Env } from '../apps/server/src/env.ts';

const SHOWN = 10;

const log: AemLog = {
  debug: () => {},
  warn: (obj, msg) => console.error(`warn: ${msg} ${JSON.stringify(obj)}`),
};

function hint(err: unknown): string {
  if (err instanceof AemAuthError) return 'check AEM_DEV_TOKEN / credentials; dev tokens expire after 24 h';
  if (err instanceof AemForbiddenError) return "the account can't read this path";
  if (err instanceof FolderNotFoundError || err instanceof AemNotFoundError) return 'check AEM_SMOKE_FOLDER';
  return '';
}

async function main(): Promise<number> {
  const started = Date.now();
  let env: Env;
  try {
    env = loadEnv();
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }
  if (env.AEM_MODE !== 'live') {
    console.error('Refusing to run: set AEM_MODE=live (and AEM_HOST, AEM_FLAVOR, AEM_AUTH + credentials) in .env');
    return 1;
  }
  const folder = env.AEM_SMOKE_FOLDER;
  try {
    const client = createHttpAemClient(env, log);
    console.log(`AEM ${new URL(parseAemHost(env.AEM_HOST ?? '')).origin} (flavor ${env.AEM_FLAVOR}, auth ${env.AEM_AUTH})`);

    const listing = await client.listFolder(folder);
    console.log(`Listing ${listing.path}: ${listing.folders.length} folders, ${listing.assets.length} assets`);
    const children = [
      ...listing.folders.map((f) => `  folder  ${f.name}`),
      ...listing.assets.map((a) => `  asset   ${a.name}`),
    ];
    for (const line of children.slice(0, SHOWN)) console.log(line);
    if (children.length > SHOWN) console.log(`  … ${children.length - SHOWN} more`);

    const hits = await client.countAssets(folder);
    console.log(`QueryBuilder dam:Asset under ${listing.path}: ${hits} hits`);
    console.log(`Elapsed ${Date.now() - started} ms`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const extra = hint(err);
    console.error(`Smoke test failed: ${message}${extra ? ` — ${extra}` : ''}`);
    console.error(`Elapsed ${Date.now() - started} ms`);
    return 1;
  }
}

process.exitCode = await main();
