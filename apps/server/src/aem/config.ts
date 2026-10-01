import type { Env } from '../env.ts';
import { basicAuth } from './auth/basic.ts';
import { devTokenAuth } from './auth/devtoken.ts';
import { readServiceCredentials, serviceAuth } from './auth/service.ts';
import type { AuthProvider } from './auth/types.ts';
import { parseAemHost } from './host.ts';

export type LiveEnv = Pick<
  Env,
  | 'AEM_HOST'
  | 'AEM_FLAVOR'
  | 'AEM_AUTH'
  | 'AEM_DEV_TOKEN'
  | 'AEM_USERNAME'
  | 'AEM_PASSWORD'
  | 'AEM_SERVICE_CREDENTIALS_PATH'
  | 'AEM_REQUEST_TIMEOUT_MS'
>;

export interface EnvIssue {
  key: keyof LiveEnv;
  message: string;
}

/** Problems with the AEM_* keys for AEM_MODE=live. Messages name keys, never values. */
export function liveEnvIssues(env: Partial<LiveEnv>): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const need = (key: keyof LiveEnv, why: string) => {
    if (!env[key]) issues.push({ key, message: `${key} is required ${why}` });
  };
  if (!env.AEM_HOST) {
    issues.push({ key: 'AEM_HOST', message: 'AEM_HOST is required when AEM_MODE=live' });
  } else {
    try {
      parseAemHost(env.AEM_HOST);
    } catch (err) {
      issues.push({ key: 'AEM_HOST', message: (err as Error).message });
    }
  }
  need('AEM_FLAVOR', 'when AEM_MODE=live (cloud or 65)');
  need('AEM_AUTH', 'when AEM_MODE=live (devtoken, basic or service)');
  if (env.AEM_AUTH === 'devtoken') need('AEM_DEV_TOKEN', 'when AEM_AUTH=devtoken');
  if (env.AEM_AUTH === 'basic') {
    need('AEM_USERNAME', 'when AEM_AUTH=basic');
    need('AEM_PASSWORD', 'when AEM_AUTH=basic');
  }
  if (env.AEM_AUTH === 'service') {
    need('AEM_SERVICE_CREDENTIALS_PATH', 'when AEM_AUTH=service');
    if (env.AEM_FLAVOR === '65') {
      issues.push({ key: 'AEM_AUTH', message: 'AEM_AUTH=service is only supported with AEM_FLAVOR=cloud' });
    }
  }
  return issues;
}

export function assertLiveEnv(env: Partial<LiveEnv>): void {
  const issues = liveEnvIssues(env);
  if (issues.length > 0) throw new Error(`Invalid AEM configuration: ${issues.map((i) => i.message).join('; ')}`);
}

export function createAuth(env: Partial<LiveEnv>, fetchImpl?: typeof fetch): AuthProvider {
  assertLiveEnv(env);
  switch (env.AEM_AUTH) {
    case 'devtoken':
      return devTokenAuth(env.AEM_DEV_TOKEN ?? '');
    case 'basic':
      return basicAuth(env.AEM_USERNAME ?? '', env.AEM_PASSWORD ?? '');
    default:
      return serviceAuth({
        credentials: readServiceCredentials(env.AEM_SERVICE_CREDENTIALS_PATH ?? ''),
        fetchImpl,
        timeoutMs: env.AEM_REQUEST_TIMEOUT_MS,
      });
  }
}
