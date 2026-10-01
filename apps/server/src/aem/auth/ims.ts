/**
 * Adobe IMS JWT exchange. This is the ONLY non-GET request in the app, and it goes to
 * Adobe IMS (https://{imsEndpoint}), never to AEM.
 */

export interface ImsExchangeInput {
  imsEndpoint: string;
  clientId: string;
  clientSecret: string;
  jwt: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ImsToken {
  accessToken: string;
  /** Token lifetime in ms. */
  lifetimeMs: number;
}

const SAFE_ERROR_CODE = /^[a-z_]{1,64}$/;

/** IMS answers this endpoint with expires_in in milliseconds; small values are treated as seconds. */
export function lifetimeMs(expiresIn: number): number {
  return expiresIn <= 86_400 ? expiresIn * 1000 : expiresIn;
}

export const imsExchangeUrl = (imsEndpoint: string): string => `https://${imsEndpoint}/ims/exchange/jwt`;

export async function exchangeJwt(input: ImsExchangeInput): Promise<ImsToken> {
  const body = new URLSearchParams({ client_id: input.clientId, client_secret: input.clientSecret, jwt_token: input.jwt });
  let res: Response;
  try {
    res = await (input.fetchImpl ?? fetch)(imsExchangeUrl(input.imsEndpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
    });
  } catch {
    throw new Error('IMS token exchange failed (network error or timeout)');
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // handled below
  }
  const data = json !== null && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  if (!res.ok) {
    const code = typeof data.error === 'string' && SAFE_ERROR_CODE.test(data.error) ? `: ${data.error}` : '';
    throw new Error(`IMS token exchange failed (HTTP ${res.status}${code})`);
  }
  const { access_token: accessToken, expires_in: expiresIn } = data;
  if (typeof accessToken !== 'string' || accessToken === '' || typeof expiresIn !== 'number' || !(expiresIn > 0)) {
    throw new Error('IMS token exchange returned an unexpected response');
  }
  return { accessToken, lifetimeMs: lifetimeMs(expiresIn) };
}
