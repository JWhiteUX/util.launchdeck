import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MockAemClient } from '../src/aem/index.ts';
import { buildApp } from '../src/app.ts';
import { copyFixtures } from './fixtures.ts';
import { validInput } from './helpers.ts';

let cleanup: () => void;
let app: FastifyInstance;
let base: string;

beforeEach(async () => {
  const fx = copyFixtures();
  cleanup = fx.cleanup;
  app = await buildApp({ dbPath: ':memory:', aemClient: new MockAemClient({ rootDir: fx.root }) });
  base = await app.listen({ port: 0, host: '127.0.0.1' });
});
afterEach(async () => {
  await app.close();
  cleanup();
});

/** Reads the SSE body until `pattern` appears or the timeout elapses. */
function streamReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  return {
    get text() {
      return text;
    },
    async waitFor(pattern: RegExp, timeoutMs = 3000): Promise<string> {
      const deadline = Date.now() + timeoutMs;
      while (!pattern.test(text)) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`Timed out waiting for ${pattern}; got:\n${text}`);
        const chunk = await Promise.race([
          reader.read(),
          new Promise<null>((r) => setTimeout(() => r(null), remaining)),
        ]);
        if (chunk === null) continue;
        if (chunk.done) throw new Error(`Stream ended; got:\n${text}`);
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text;
    },
  };
}

describe('GET /api/stream', () => {
  it('sends health, then campaign and change events', async () => {
    const abort = new AbortController();
    const res = await fetch(`${base}/api/stream`, { signal: abort.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('x-accel-buffering')).toBe('no');

    const sse = streamReader(res.body!);
    await sse.waitFor(/^event: health\ndata: \{"type":"health"/);
    expect(app.bus.subscriberCount).toBe(1);

    const created = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: { ...validInput, folders: ['/content/dam/brand/fall-launch'] },
    });
    expect(created.statusCode).toBe(201);

    await sse.waitFor(/event: campaign\ndata: .*"action":"created"/);
    const text = await sse.waitFor(/event: change\ndata: .*\n\n/);
    const changeLine = text.split('\n').find((l) => l.startsWith('data: {"type":"change"'));
    const change = JSON.parse(changeLine!.slice(6)) as { events: unknown[]; campaignIds: string[] };
    expect(change.events).toHaveLength(5);
    expect(change.campaignIds).toEqual([created.json<{ id: string }>().id]);

    abort.abort();
    await expect.poll(() => app.bus.subscriberCount).toBe(0);
  });

  it('closes cleanly when the app shuts down with a client connected', async () => {
    const res = await fetch(`${base}/api/stream`);
    const sse = streamReader(res.body!);
    await sse.waitFor(/event: health/);
    await app.close();
    expect(app.bus.subscriberCount).toBe(0);
  });
});
