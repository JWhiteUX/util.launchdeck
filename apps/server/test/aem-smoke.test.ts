import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AemStub } from './aem-stub.ts';
import { startAemStub } from './aem-stub.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const TOKEN = 'smoke-dev-token-DO-NOT-PRINT';

interface RunResult {
  code: number;
  out: string;
}

function runSmoke(env: Record<string, string>): Promise<RunResult> {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AEM_')));
  const aemBlank = Object.fromEntries(
    ['AEM_FLAVOR', 'AEM_AUTH', 'AEM_HOST', 'AEM_DEV_TOKEN', 'AEM_USERNAME', 'AEM_PASSWORD', 'AEM_SERVICE_CREDENTIALS_PATH'].map(
      (k) => [k, ''],
    ),
  );
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', 'scripts/aem-smoke.ts'],
      { cwd: repoRoot, env: { ...clean, ...aemBlank, ...env }, timeout: 30_000 },
      (err, stdout, stderr) => {
        const code = err && typeof err.code === 'number' ? err.code : err ? 1 : 0;
        resolve({ code, out: `${stdout}\n${stderr}` });
      },
    );
  });
}

let stub: AemStub;
beforeEach(async () => {
  stub = await startAemStub({ authorization: `Bearer ${TOKEN}` });
  stub.state.folders.set('/content/dam/brand', 'Brand');
  stub.state.folders.set('/content/dam/campaigns', null);
  stub.state.assets.set('/content/dam/logo.svg', { lastModified: '2026-09-01T10:00:00Z' });
  stub.state.assets.set('/content/dam/brand/a.jpg', { lastModified: '2026-09-01T10:00:00Z' });
});
afterEach(() => stub.close());

const live = () => ({
  AEM_MODE: 'live',
  AEM_HOST: stub.url,
  AEM_FLAVOR: 'cloud',
  AEM_AUTH: 'devtoken',
  AEM_DEV_TOKEN: TOKEN,
  AEM_SMOKE_FOLDER: '/content/dam',
});

describe('scripts/aem-smoke.ts', () => {
  it('prints the listing and the QueryBuilder hit count', async () => {
    const { code, out } = await runSmoke(live());
    expect(code).toBe(0);
    expect(out).toContain('Listing /content/dam: 2 folders, 1 assets');
    expect(out).toContain('folder  brand');
    expect(out).toContain('asset   logo.svg');
    expect(out).toContain('QueryBuilder dam:Asset under /content/dam: 2 hits');
    expect(out).toMatch(/Elapsed \d+ ms/);
    expect(out).not.toContain(TOKEN);
    expect(stub.state.requests.every((r) => r.method === 'GET')).toBe(true);
  }, 30_000);

  it('exits 1 on 401 with a hint and without leaking the token', async () => {
    const wrong = 'wrong-token-ALSO-SECRET';
    const { code, out } = await runSmoke({ ...live(), AEM_DEV_TOKEN: wrong });
    expect(code).toBe(1);
    expect(out).toContain('Smoke test failed: AEM 401 on /api/assets.json');
    expect(out).toContain('check AEM_DEV_TOKEN / credentials');
    expect(out).not.toContain(wrong);
    expect(out).not.toContain(TOKEN);
  }, 30_000);

  it('refuses to run unless AEM_MODE=live', async () => {
    const { code, out } = await runSmoke({ AEM_MODE: 'mock' });
    expect(code).toBe(1);
    expect(out).toContain('Refusing to run: set AEM_MODE=live');
  }, 30_000);
});
