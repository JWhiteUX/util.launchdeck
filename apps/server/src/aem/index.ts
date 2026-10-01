import type { Env } from '../env.ts';
import type { AemClient } from './AemClient.ts';
import { createAuth } from './config.ts';
import type { LiveEnv } from './config.ts';
import { createAemHttp } from './http.ts';
import { HttpAemClient } from './HttpAemClient.ts';
import type { AemLog } from './log.ts';
import { MockAemClient } from './MockAemClient.ts';

export * from './AemClient.ts';
export { MockAemClient } from './MockAemClient.ts';
export { HttpAemClient } from './HttpAemClient.ts';
export { InvalidAemPathError, normalizeAemPath } from './paths.ts';
export { AemAuthError, AemForbiddenError, AemHttpError, AemNotFoundError } from './errors.ts';
export { mimeFromName } from './mime.ts';
export type { AemLog } from './log.ts';

export type AemEnv = Pick<Env, 'AEM_MODE' | 'AEM_FIXTURES_DIR'> & Partial<LiveEnv>;

export interface CreateAemClientOptions {
  fetchImpl?: typeof fetch;
}

/** Live client from env (validated); throws with key names, never values, when misconfigured. */
export function createHttpAemClient(env: Partial<LiveEnv>, log?: AemLog, opts: CreateAemClientOptions = {}) {
  const auth = createAuth(env, opts.fetchImpl);
  const http = createAemHttp({
    host: env.AEM_HOST ?? '',
    auth,
    log,
    timeoutMs: env.AEM_REQUEST_TIMEOUT_MS,
    fetchImpl: opts.fetchImpl,
  });
  return new HttpAemClient({ http, log });
}

export function createAemClient(env: AemEnv, log?: AemLog, opts: CreateAemClientOptions = {}): AemClient {
  if (env.AEM_MODE === 'mock') {
    const logger = log ? { warn: (msg: string) => log.warn({}, msg) } : undefined;
    return new MockAemClient({ rootDir: env.AEM_FIXTURES_DIR, logger });
  }
  return createHttpAemClient(env, log, opts);
}
