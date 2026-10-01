import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import type { AemLog } from '../src/aem/log.ts';

export interface StubAsset {
  lastModified: string;
  by?: string | null;
  format?: string | string[] | null;
}

export interface StubRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  authorization: string | undefined;
}

export interface StubState {
  /** Folder path → optional jcr:title. /content/dam always exists. */
  folders: Map<string, string | null>;
  assets: Map<string, StubAsset>;
  /** Expected Authorization header; anything else gets 401. */
  authorization: string;
  /** Status of GET /var/audit/com.day.cq.dam.json. */
  auditProbeStatus: number;
  /** Return selective hits flat (`jcr:content/jcr:lastModified`) instead of nested. */
  flatHits: boolean;
  /** Per-request latency. */
  delayMs: number;
  /** Scripted responses consumed before normal routing. */
  script: { status: number; headers?: Record<string, string>; body?: string }[];
  requests: StubRequest[];
  inFlight: number;
  maxInFlight: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** AEM's JSON rendering of a Date: `Wed Oct 01 2026 10:00:00 GMT+0000`. */
export function ecmaDate(iso: string): string {
  const d = new Date(iso);
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${d.getUTCFullYear()} ${time} GMT+0000`;
}

const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/'));
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function route(state: StubState, path: string, q: URLSearchParams, res: ServerResponse) {
  if (path === '/var/audit/com.day.cq.dam.json') {
    return send(res, state.auditProbeStatus, state.auditProbeStatus === 200 ? { 'jcr:primaryType': 'sling:Folder' } : '');
  }
  if (path.startsWith('/api/assets') && path.endsWith('.json')) {
    const rel = path.slice('/api/assets'.length, -'.json'.length);
    const folder = `/content/dam${rel}`;
    if (folder !== '/content/dam' && !state.folders.has(folder)) return send(res, 404, { 'status.code': 404 });
    const entities = [
      ...[...state.folders].filter(([p]) => parentOf(p) === folder).map(([p, title]) => ({
        class: ['assets/folder'],
        properties: { name: nameOf(p), ...(title ? { 'jcr:title': title } : {}) },
      })),
      ...[...state.assets.keys()].filter((p) => parentOf(p) === folder).map((p) => ({
        class: ['assets/asset'],
        properties: { name: nameOf(p) },
      })),
    ];
    const offset = Number(q.get('offset') ?? 0);
    const limit = Number(q.get('limit') ?? 20);
    return send(res, 200, { class: ['assets/folder'], properties: {}, entities: entities.slice(offset, offset + limit) });
  }
  if (path === '/bin/querybuilder.json') {
    const under = q.get('path') ?? '';
    if (q.get('type') === 'cq:AuditEvent') return send(res, 200, { success: true, results: 0, total: 0, hits: [] });
    const lower = q.get('daterange.lowerBound');
    const matches = [...state.assets]
      .filter(([p]) => p.startsWith(`${under}/`))
      .filter(([, a]) => !lower || Date.parse(a.lastModified) > Date.parse(lower))
      .sort(([a], [b]) => (a < b ? -1 : 1));
    if (q.get('p.limit') === '0') return send(res, 200, { success: true, results: 0, total: matches.length, hits: [] });
    const hits = matches.map(([p, a]) =>
      state.flatHits
        ? {
            'jcr:path': p,
            'jcr:content/jcr:lastModified': ecmaDate(a.lastModified),
            'jcr:content/jcr:lastModifiedBy': a.by ?? undefined,
            'jcr:content/metadata/dc:format': a.format ?? undefined,
          }
        : {
            'jcr:path': p,
            'jcr:content': {
              'jcr:lastModified': ecmaDate(a.lastModified),
              'jcr:lastModifiedBy': a.by ?? undefined,
              metadata: a.format ? { 'dc:format': a.format } : {},
            },
          },
    );
    return send(res, 200, { success: true, results: hits.length, total: hits.length, more: false, hits });
  }
  return send(res, 404, '');
}

/** Minimal AEM on 127.0.0.1:0: Assets API (Siren), QueryBuilder and the audit probe. GET only. */
export async function startAemStub(init: Partial<StubState> = {}) {
  const state: StubState = {
    folders: new Map(),
    assets: new Map(),
    authorization: 'Bearer stub-token',
    auditProbeStatus: 200,
    flatHits: false,
    delayMs: 0,
    script: [],
    requests: [],
    inFlight: 0,
    maxInFlight: 0,
    ...init,
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    state.requests.push({
      method: req.method ?? '',
      path: decodeURIComponent(url.pathname),
      query: url.searchParams,
      authorization: req.headers.authorization,
    });
    state.inFlight++;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    res.on('close', () => state.inFlight--);
    setTimeout(() => {
      if (req.method !== 'GET') return send(res, 405, '');
      if (req.headers.authorization !== state.authorization) return send(res, 401, '');
      const scripted = state.script.shift();
      if (scripted) return send(res, scripted.status, scripted.body ?? '', scripted.headers);
      route(state, decodeURIComponent(url.pathname), url.searchParams, res);
    }, state.delayMs);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export type AemStub = Awaited<ReturnType<typeof startAemStub>>;

export function captureLog() {
  const lines: string[] = [];
  const log: AemLog = {
    debug: (obj, msg) => lines.push(`${msg} ${JSON.stringify(obj)}`),
    warn: (obj, msg) => lines.push(`${msg} ${JSON.stringify(obj)}`),
  };
  return { log, lines };
}

export function throwawayKeys() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

export function serviceCredentialsJson(privateKey: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    ok: true,
    integration: {
      imsEndpoint: 'ims-na1.adobelogin.com',
      metascopes: 'ent_aem_cloud_api,ent_cloudmgr_sdk',
      technicalAccount: { clientId: 'client-id-123', clientSecret: 'p8e-CLIENT-SECRET-value' },
      id: 'TECHACCT@techacct.adobe.com',
      org: 'ORG123@AdobeOrg',
      privateKey,
      ...overrides,
    },
    statusCode: 200,
  });
}

/** A fetch stub that records calls and answers from a handler. */
export function recordingFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; method: string; headers: Headers; body: string | null }[] = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body === undefined || init.body === null ? null : String(init.body),
    });
    return handler(url, init);
  };
  return { fetchImpl, calls };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
