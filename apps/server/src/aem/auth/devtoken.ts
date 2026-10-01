import type { AuthProvider } from './types.ts';

/** AEMaaCS local development token (24 h, copied from the Developer Console). */
export function devTokenAuth(token: string): AuthProvider {
  const header = `Bearer ${token.trim()}`;
  return { kind: 'devtoken', refreshable: false, header: async () => header, invalidate: () => {} };
}
