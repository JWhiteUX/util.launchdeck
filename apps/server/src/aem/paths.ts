import { posix } from 'node:path';

export const DAM_ROOT = '/content/dam';

export class InvalidAemPathError extends Error {
  constructor(public readonly aemPath: string) {
    super(`Invalid AEM path: ${aemPath}`);
    this.name = 'InvalidAemPathError';
  }
}

/** Validates and normalizes a JCR path; it must live under /content/dam and contain no `..`. */
export function normalizeAemPath(path: string): string {
  if (!path.startsWith('/') || path.includes('\0') || path.split('/').includes('..')) {
    throw new InvalidAemPathError(path);
  }
  const normalized = posix.normalize(path).replace(/\/+$/, '');
  if (normalized !== DAM_ROOT && !normalized.startsWith(`${DAM_ROOT}/`)) throw new InvalidAemPathError(path);
  return normalized;
}

/** Path relative to the DAM root, as the Assets HTTP API expects ('' for the root). */
export const damRelative = (folderPath: string): string => folderPath.slice(DAM_ROOT.length);
