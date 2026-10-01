import type { Env } from '../env.ts';
import type { AemClient } from './AemClient.ts';
import type { MockAemLogger } from './MockAemClient.ts';
import { MockAemClient } from './MockAemClient.ts';

export * from './AemClient.ts';
export { MockAemClient, InvalidAemPathError, normalizeAemPath } from './MockAemClient.ts';
export { mimeFromName } from './mime.ts';

export function createAemClient(
  env: Pick<Env, 'AEM_MODE' | 'AEM_FIXTURES_DIR'>,
  logger?: MockAemLogger,
): AemClient {
  if (env.AEM_MODE === 'mock') return new MockAemClient({ rootDir: env.AEM_FIXTURES_DIR, logger });
  throw new Error('AEM_MODE=live is implemented in Phase 5');
}
