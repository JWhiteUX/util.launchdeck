import type { AuthProvider } from './types.ts';

/** HTTP Basic, for AEM 6.5 or a local SDK. */
export function basicAuth(username: string, password: string): AuthProvider {
  const header = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
  return { kind: 'basic', refreshable: false, header: async () => header, invalidate: () => {} };
}
