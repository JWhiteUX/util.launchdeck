import { createPrivateKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export interface ServiceIntegration {
  imsEndpoint: string;
  metascopes: string;
  clientId: string;
  /** Technical account id (JWT `sub`). */
  id: string;
  /** IMS org id (JWT `iss`). */
  org: string;
}

export const JWT_LIFETIME_SEC = 3600;

const b64url = (data: string | Buffer): string => Buffer.from(data).toString('base64url');

export function loadPrivateKey(pem: string): KeyObject {
  try {
    return createPrivateKey(pem);
  } catch {
    throw new Error('Service credentials: integration.privateKey is not a valid PEM private key');
  }
}

export function jwtClaims(integration: ServiceIntegration, nowSec: number): Record<string, string | number | boolean> {
  const ims = `https://${integration.imsEndpoint}`;
  const claims: Record<string, string | number | boolean> = {
    exp: nowSec + JWT_LIFETIME_SEC,
    iss: integration.org,
    sub: integration.id,
    aud: `${ims}/c/${integration.clientId}`,
  };
  for (const scope of integration.metascopes.split(',').map((s) => s.trim()).filter(Boolean)) {
    claims[`${ims}/s/${scope}`] = true;
  }
  return claims;
}

/** RS256 JWT for the IMS JWT bearer exchange. */
export function signJwt(integration: ServiceIntegration, key: KeyObject, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(jwtClaims(integration, nowSec)));
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), key);
  return `${header}.${payload}.${b64url(signature)}`;
}
