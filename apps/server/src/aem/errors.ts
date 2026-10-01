/**
 * HTTP failures talking to AEM. Messages carry only the status, path and attempt count:
 * never headers, query values or response bodies, because they surface in the UI.
 */
export class AemHttpError extends Error {
  constructor(
    public readonly status: number | null,
    public readonly path: string,
    public readonly attempts: number,
    detail?: string,
  ) {
    const what = status === null ? (detail ?? 'request failed') : `${status}`;
    const tries = attempts > 1 ? ` after ${attempts} attempts` : '';
    super(`AEM ${what} on ${path}${tries}`);
    this.name = 'AemHttpError';
  }
}

/** 401: credentials missing, expired or rejected. */
export class AemAuthError extends AemHttpError {
  override readonly name = 'AemAuthError';
}

/** 403: authenticated, but the account cannot read the path. */
export class AemForbiddenError extends AemHttpError {
  override readonly name = 'AemForbiddenError';
}

export class AemNotFoundError extends AemHttpError {
  override readonly name = 'AemNotFoundError';
}
