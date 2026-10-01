import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../src/env.ts';

export const FIXTURES_DIR = join(repoRoot, 'fixtures', 'aem');

/** Copies fixtures/aem into a fresh tmp dir so tests can touch/unlink without mutating the repo. */
export function copyFixtures(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'launchdeck-aem-'));
  cpSync(FIXTURES_DIR, root, { recursive: true });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
