export type AuthKind = 'devtoken' | 'basic' | 'service';

/** Supplies the Authorization header for AEM requests. Implementations never log the value. */
export interface AuthProvider {
  readonly kind: AuthKind;
  /** True when invalidate() + header() can yield a different credential (service tokens). */
  readonly refreshable: boolean;
  header(): Promise<string>;
  /** Drop any cached credential, e.g. after AEM answered 401. */
  invalidate(): void;
}
