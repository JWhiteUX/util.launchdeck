import { readFileSync } from 'node:fs';
import type { KeyObject } from 'node:crypto';
import { z } from 'zod';
import { exchangeJwt } from './ims.ts';
import { loadPrivateKey, signJwt } from './jwt.ts';
import type { ServiceIntegration } from './jwt.ts';
import type { AuthProvider } from './types.ts';

export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const nonEmpty = z.string().min(1);
const credentialsSchema = z.object({
  integration: z.object({
    imsEndpoint: z.string().regex(/^[a-z0-9.-]+$/i),
    metascopes: nonEmpty,
    technicalAccount: z.object({ clientId: nonEmpty, clientSecret: nonEmpty }),
    id: nonEmpty,
    org: nonEmpty,
    privateKey: nonEmpty,
  }),
});

export interface ServiceCredentials {
  integration: ServiceIntegration;
  clientSecret: string;
  privateKey: KeyObject;
}

/** Parse the AEMaaCS service credentials JSON. Errors name the missing fields, never their values. */
export function parseServiceCredentials(text: string): ServiceCredentials {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Service credentials file is not valid JSON');
  }
  const parsed = credentialsSchema.safeParse(json);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new Error(`Service credentials file is missing or has invalid fields: ${fields}`);
  }
  const { technicalAccount, privateKey, ...rest } = parsed.data.integration;
  return {
    integration: { ...rest, clientId: technicalAccount.clientId },
    clientSecret: technicalAccount.clientSecret,
    privateKey: loadPrivateKey(privateKey),
  };
}

export function readServiceCredentials(path: string): ServiceCredentials {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error('AEM_SERVICE_CREDENTIALS_PATH: the service credentials file could not be read');
  }
  return parseServiceCredentials(text);
}

export interface ServiceAuthOptions {
  credentials: ServiceCredentials;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

interface CachedToken {
  header: string;
  refreshAt: number;
}

/**
 * Server-to-server auth: signs a JWT, exchanges it at IMS, and caches the access token until
 * 5 minutes before expiry. Concurrent callers share one in-flight exchange.
 */
export function serviceAuth(opts: ServiceAuthOptions): AuthProvider {
  const now = opts.now ?? Date.now;
  const { integration, clientSecret, privateKey } = opts.credentials;
  let cached: CachedToken | null = null;
  let inflight: Promise<string> | null = null;

  async function refresh(): Promise<string> {
    const issuedAt = now();
    const jwt = signJwt(integration, privateKey, Math.floor(issuedAt / 1000));
    const token = await exchangeJwt({
      imsEndpoint: integration.imsEndpoint,
      clientId: integration.clientId,
      clientSecret,
      jwt,
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
    });
    const margin = Math.min(REFRESH_MARGIN_MS, token.lifetimeMs / 2);
    cached = { header: `Bearer ${token.accessToken}`, refreshAt: issuedAt + token.lifetimeMs - margin };
    return cached.header;
  }

  return {
    kind: 'service',
    refreshable: true,
    header() {
      if (cached && now() < cached.refreshAt) return Promise.resolve(cached.header);
      inflight ??= refresh().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    invalidate() {
      cached = null;
    },
  };
}
