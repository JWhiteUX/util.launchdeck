# Launchdeck

<img width="1709" height="1456" alt="util-launchdeck orca localhost-4" src="https://github.com/user-attachments/assets/4ff78fe9-f0bf-45f0-8316-98b5d41d33cb" />

Launchdeck is a local launch-readiness dashboard for one marketer on macOS. It has no login. Campaigns sit on a Gantt chart, and each campaign is bound to one or more AEM DAM folders. A watcher polls those folders and records what changed, when, who changed it, and the file type. Each campaign gets a readiness badge, computed in `packages/shared/src/status.ts`. The rules are checked in this order:

| Badge | Label | Rule |
|---|---|---|
| Red | `ERROR` | A bound folder is failing: its latest poll error is newer than its latest successful poll. |
| Red | `EMPTY` | Launch is between 1 day ago and 7 days away, and a bound folder has 0 assets. |
| Amber | `N CHANGES` | A change was detected after the campaign was last reviewed, or the campaign has changes and was never reviewed. |
| Green | `READY` | None of the above. |

Select **Mark reviewed** to clear amber. This writes only to the local database, never to AEM.

## Requirements

- macOS.
- Node 20.12 or later. The server loads `.env` with `process.loadEnvFile`, which older versions don't have.
- npm, for workspaces.
- `better-sqlite3` is a native module. npm normally installs a prebuilt binary. Xcode Command Line Tools (`xcode-select --install`) are needed only if npm has to build it from source.

## Local setup

1. Check Node. It must print v20.12 or later.

   ```sh
   node -v
   ```

2. Clone and install.

   ```sh
   git clone https://github.com/JWhiteUX/util.launchdeck.git
   cd util.launchdeck
   npm install
   ```

3. Create `.env` from the example. The defaults run in mock mode, with no AEM access needed.

   ```sh
   cp .env.example .env
   ```

4. Check the install. All three must exit 0.

   ```sh
   npm run lint && npm run typecheck && npm test
   ```

5. Start both apps.

   ```sh
   npm run dev
   ```

   The API server runs on `127.0.0.1:4000` and the web app on port 3001. Open **http://localhost:3001**. Use `localhost`, not `127.0.0.1`, because Vite listens on `localhost` only. Ctrl+C stops both.

The database is created on first start at `data/launchdeck.db`. The first poll of a newly bound folder records every existing asset as ADDED. After that, only changes are recorded.

## Quick start (mock mode)

1. Select **New campaign** and bind it to `/content/dam/brand/fall-launch`. ADDED events appear in the activity feed without a refresh.
2. Try these changes. Each one shows up on the next poll (every `WATCH_INTERVAL_SEC` seconds, default 60).

| Action | Result |
|---|---|
| `touch fixtures/aem/content/dam/brand/fall-launch/hero.jpg` | A MODIFIED event for `hero.jpg`. |
| `rm fixtures/aem/content/dam/brand/fall-launch/specs.pdf` | A DELETED event for `specs.pdf`. |
| Bind a campaign to `/content/dam/brand/holiday-promo` | The audit log is denied for this folder. The server logs one warning, users come from `jcr:lastModifiedBy`, and the watcher panel shows a `JCR FALLBACK` tag. |
| Bind a campaign to `/content/dam/brand/empty-soon` with a launch date within 7 days | A red `EMPTY` badge. |

Restore the fixtures when you are done:

```sh
git checkout -- fixtures/aem
```

To experiment without touching the tracked fixtures, point the app at a copy:

```sh
cp -R fixtures/aem /tmp/launchdeck-fixtures
AEM_FIXTURES_DIR=/tmp/launchdeck-fixtures WATCH_INTERVAL_SEC=15 npm run dev
```

## Using the dashboard

| Area | What it does |
|---|---|
| **Timeline** | One bar per campaign, from start date to launch date. Each campaign keeps its own colour, assigned in creation order. After eight campaigns, bars are ink. The orange line marks today. |
| **Height** | `DEFAULT` fits the campaigns. `2×` and `3×` reserve room for at least 8 and 12 rows. The choice is remembered in the browser. |
| **Scale** | Day, week or month columns. |
| **Campaign list** | Below the chart. Shows the colour swatch, dates and readiness badge. Select a row, or a bar, to open its activity. |
| **Activity** | Campaign details and the change feed: type, asset, file type, user and local time. Filter by user or file type. Unreviewed rows are highlighted. **Mark reviewed** clears them. |
| **Watcher** | Each watched folder's last poll, asset count and last error. `JCR FALLBACK` means the audit log isn't readable. **Poll now** runs a poll immediately. |

Times are stored in UTC and shown in your local time zone. The UI follows the macOS light or dark appearance.

## Configuration (`.env`)

All settings and credentials are read from `.env` in the repo root and nothing else. `.env` is gitignored. Never commit it. Keep the service credentials JSON outside the repo and point to it by path.

| Key | Default | Required when | Description |
|---|---|---|---|
| `PORT` | `4000` | — | API server port. The server binds to `127.0.0.1`. |
| `WEB_PORT` | `3001` | — | Vite dev server port. The Vite proxy forwards `/api` to `127.0.0.1:4000`. |
| `DB_PATH` | `./data/launchdeck.db` | — | SQLite file, relative to the repo root. |
| `WATCH_INTERVAL_SEC` | `60` | — | Seconds between watcher polls. |
| `AEM_MODE` | `mock` | — | `mock` reads `AEM_FIXTURES_DIR`. `live` calls AEM over HTTP. |
| `AEM_FIXTURES_DIR` | `./fixtures/aem` | `AEM_MODE=mock` | Root of the mock DAM. |
| `AEM_FLAVOR` | `cloud` | `AEM_MODE=live` | `cloud` (AEM as a Cloud Service) or `65` (AEM 6.5). |
| `AEM_AUTH` | `devtoken` | `AEM_MODE=live` | `devtoken`, `service` (cloud only) or `basic`. |
| `AEM_HOST` | empty | `AEM_MODE=live` | AEM origin, for example `https://author-p123-e456.adobeaemcloud.com`. Must be https; http is accepted only for `localhost` or `127.0.0.1` (local SDK). |
| `AEM_DEV_TOKEN` | empty | `AEM_AUTH=devtoken` | Bearer token. |
| `AEM_USERNAME` | empty | `AEM_AUTH=basic` | Basic auth user. |
| `AEM_PASSWORD` | empty | `AEM_AUTH=basic` | Basic auth password. |
| `AEM_SERVICE_CREDENTIALS_PATH` | empty | `AEM_AUTH=service` | Absolute path to the service credentials JSON. Keep it outside the repo. |
| `AEM_SMOKE_FOLDER` | `/content/dam` | — | Folder that `scripts/aem-smoke.ts` lists and queries. |
| `AEM_REQUEST_TIMEOUT_MS` | `30000` | — | Timeout for each AEM request attempt, in milliseconds. |

Blank values count as unset. The server log redacts the `Authorization` and `Cookie` request headers, and token, password and secret fields.

In live mode, settings are checked at startup. A missing or invalid key stops the server with a message that names the key but never prints its value, for example `AEM_HOST is required when AEM_MODE=live`.

### Example `.env` files

Mock mode (the default; no AEM needed):

```ini
AEM_MODE=mock
```

AEM as a Cloud Service with a local development token (simplest live setup; the token lasts 24 h):

```ini
AEM_MODE=live
AEM_FLAVOR=cloud
AEM_AUTH=devtoken
AEM_HOST=https://author-p12345-e67890.adobeaemcloud.com
AEM_DEV_TOKEN=<paste token>
AEM_SMOKE_FOLDER=/content/dam/brand
```

AEM as a Cloud Service with service credentials (no daily token refresh):

```ini
AEM_MODE=live
AEM_FLAVOR=cloud
AEM_AUTH=service
AEM_HOST=https://author-p12345-e67890.adobeaemcloud.com
AEM_SERVICE_CREDENTIALS_PATH=/Users/you/.secrets/aem-service-credentials.json
```

AEM 6.5 with basic auth:

```ini
AEM_MODE=live
AEM_FLAVOR=65
AEM_AUTH=basic
AEM_HOST=https://author.example.com
AEM_USERNAME=launchdeck-reader
AEM_PASSWORD=<password>
```

Use a read-only account. Launchdeck never writes to AEM, so it needs no write permissions.

## Mock vs live mode

Every AEM call goes through the `AemClient` interface (`apps/server/src/aem/AemClient.ts`).

**Mock** (`AEM_MODE=mock`) uses `MockAemClient`, which reads `fixtures/aem/` from disk on every poll. There is no filesystem watcher. You need no AEM access or credentials.

**Live** (`AEM_MODE=live`) uses `HttpAemClient`. It is strictly read-only:

- AEM requests are GET only. The client has no way to send any other method.
- The only POST is the IMS token exchange for `AEM_AUTH=service`. It goes to Adobe IMS, not to AEM.
- The watcher polls every `WATCH_INTERVAL_SEC` seconds (default 60).
- 429, 5xx, timeouts and network errors are retried with exponential backoff and jitter: up to 5 attempts, starting at 500 ms. `Retry-After` is honoured, capped at 30 s per wait. Other 4xx responses and redirects are not retried.
- At most 4 AEM requests run at once.
- Logs include the method, path, status and duration only. Tokens, credentials and response bodies are never logged.

Live mode uses these AEM endpoints:

| Purpose | Request |
|---|---|
| Folder picker | `GET /api/assets{path}.json` (Assets HTTP API, rooted at `/content/dam`) |
| Changed assets | `GET /bin/querybuilder.json`: `type=dam:Asset` with a date range on `jcr:content/jcr:lastModified` |
| Who made a change | `GET /bin/querybuilder.json`: `type=cq:AuditEvent` under `/var/audit/com.day.cq.dam{folder}` |

QueryBuilder can't see deleted assets. Deletes are detected by comparing each poll's full asset list with the stored folder snapshot.

QueryBuilder also returns zero hits, not an error, for a path the account can't read. So before using the audit log, the client checks `GET /var/audit/com.day.cq.dam.json` once per server start. A 401, 403 or 404 there means "audit not readable".

### Auth matrix

| `AEM_FLAVOR` | `AEM_AUTH` | Credentials | Notes |
|---|---|---|---|
| `cloud` | `devtoken` | `AEM_DEV_TOKEN` | From the Developer Console, "Local development token". It expires every 24 h. |
| `cloud` | `service` | `AEM_SERVICE_CREDENTIALS_PATH` | From the Developer Console, "Service credentials" JSON. A signed JWT is exchanged at Adobe IMS for an access token, which is cached until 5 min before expiry. The technical account needs read access on the DAM folders. |
| `cloud` | `basic` | `AEM_USERNAME`, `AEM_PASSWORD` | Local AEM SDK only. |
| `65` | `basic` | `AEM_USERNAME`, `AEM_PASSWORD` | Standard for AEM 6.5. |
| `65` | `devtoken` | `AEM_DEV_TOKEN` | Sent as a bearer token. Use it only if your instance accepts bearer tokens. |
| `65` | `service` | — | Rejected at startup. Service credentials are cloud only. |

### AEM permissions

| Path | Access | Needed for |
|---|---|---|
| `/content/dam/...` (each bound folder) | Read | Folder listing, change detection, deletes. |
| `/var/audit/com.day.cq.dam` | Read | Audit enrichment: the user who made each change. |

Without read access to the audit path, the watcher logs one warning per folder per server start. It then takes the user from `jcr:lastModifiedBy`. A missing audit log never fails the poll. The feed marks those users `JCR`, and the watcher panel shows `JCR FALLBACK` for the folder.

### Smoke test

Use this to check live credentials before starting the app. Set `AEM_MODE=live` and the auth keys in `.env`, then run:

```sh
npx tsx scripts/aem-smoke.ts
```

It lists `AEM_SMOKE_FOLDER` (folder and asset counts) and runs one QueryBuilder query (hit count). It never prints tokens. The hit count is exact, so on a very large DAM point `AEM_SMOKE_FOLDER` at a smaller folder.

| Failure | Likely cause |
|---|---|
| 401 | The token expired or is wrong. Development tokens last 24 h, so generate a new one. |
| 403 | The account has no read access to the folder. |
| 404 | `AEM_SMOKE_FOLDER` does not exist, or `AEM_HOST` points to the wrong environment. |

## Fixtures

`fixtures/aem/` mirrors the JCR: `fixtures/aem/content/dam/brand/fall-launch/hero.jpg` is the asset `/content/dam/brand/fall-launch/hero.jpg`. Directories are folders and files are assets. The full format is in [fixtures/aem/README.md](fixtures/aem/README.md). In short:

- A file's mtime is its `jcr:lastModified`.
- The file type is derived from the extension.
- Names starting with `_` or `.` are ignored. The control files below use the `_` prefix.

| File | Effect |
|---|---|
| `_folder.json` | Folder title shown in the folder picker. |
| `_meta.json` | `jcr:lastModifiedBy` per asset, with a `defaultUser`. Without it the user is `admin`. |
| `_audit.json` with `{ "denied": true }` | The audit log is unreadable, so the watcher uses the `jcr:lastModifiedBy` fallback. |
| `_audit.json` with `users` / `defaultUser` | The audit log is readable. Audit users per asset. |

Included folders:

| Folder | Case |
|---|---|
| `brand/fall-launch` | Audit readable. jpg, png, pdf and mp4 files, plus a `social/` subfolder. |
| `brand/holiday-promo` | Audit denied. |
| `brand/empty-soon` | No assets. |

To add a fixture folder:

1. Create a directory under `fixtures/aem/content/dam/`, for example `fixtures/aem/content/dam/brand/spring-sale/`.
2. Add asset files. Their content doesn't matter, only names and mtimes.
3. Optionally add `_folder.json`, `_meta.json` and `_audit.json`.
4. Bind a campaign to `/content/dam/brand/spring-sale`. The server doesn't need a restart.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs the server (`tsx watch`) and the web app (Vite) together. |
| `npm run lint` | ESLint over the repo. |
| `npm run typecheck` | `tsc --noEmit` in every workspace. |
| `npm test` | Vitest, run once. |
| `npx tsx scripts/aem-smoke.ts` | Live AEM smoke test. See [Smoke test](#smoke-test). |

Run `npm run lint && npm run typecheck && npm test` before committing. All three must exit 0.

### Database

The database is SQLite at `DB_PATH` (default `./data/launchdeck.db`). `data/` is gitignored. Migrations in `apps/server/src/db/migrations/` run at startup. To reset, stop the server and delete the file:

```sh
rm data/launchdeck.db
```

The next start creates an empty database.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Port 3001 is already in use` or `EADDRINUSE` on 4000 | Another process holds the port. Set `WEB_PORT` or `PORT` in `.env`, or stop that process. Find it with `lsof -nP -iTCP:3001 -sTCP:LISTEN`. Port 3000 is avoided on purpose because Docker often uses it. |
| The page says "Can't load campaigns" | The API server isn't running or crashed. Check the `[server]` lines in the `npm run dev` output. |
| `http://127.0.0.1:3001` doesn't load | Use `http://localhost:3001`. |
| `was compiled against a different Node.js version` | Run `npm rebuild better-sqlite3` after a Node upgrade. |
| `Invalid environment:` on start | Fix each key it lists in `.env`. See [Configuration](#configuration-env). |
| Live mode: 401 after a day | The development token expired. Generate a new one in the Developer Console. |
| Live mode: no users in the feed, `JCR FALLBACK` | The account can't read `/var/audit/com.day.cq.dam`. See [AEM permissions](#aem-permissions). Restart the server after granting access. |
| Start fresh | Stop the server and run `rm data/launchdeck.db`. |

## Project layout

```
apps/
  server/             Fastify API, port 4000
    src/aem/          AemClient interface, MockAemClient, HttpAemClient
    src/db/           SQLite connection and migrations
    src/repo/         Campaign, folder and event queries
    src/routes/       HTTP and SSE routes
    src/watcher/      Poller, snapshot diff, audit enrichment, scheduler, event bus
  web/                Vite + React UI, port 3001
packages/
  shared/             Types, zod schemas, badge logic (status.ts)
fixtures/aem/         Mock DAM for AEM_MODE=mock
design/               Ferrite design system
scripts/              dev.mjs, aem-smoke.ts
```

## API

All routes are under `/api` on port 4000. The web app reaches them through the Vite proxy.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/campaigns` | List campaigns with badges. |
| POST | `/api/campaigns` | Create a campaign. |
| GET | `/api/campaigns/:id` | Get one campaign. |
| PUT | `/api/campaigns/:id` | Update a campaign. |
| DELETE | `/api/campaigns/:id` | Delete a campaign. |
| POST | `/api/campaigns/:id/review` | Mark reviewed: sets `reviewedAt` to now, in the local database only. |
| GET | `/api/campaigns/:id/events` | Change events for the campaign's folders. Optional `user` and `format` filters. |
| GET | `/api/campaigns/:id/events/facets` | Distinct users and formats, for the feed filters. |
| GET | `/api/folders?path=` | Immediate child folders and assets. Defaults to `/content/dam`. |
| GET | `/api/watcher/health` | Poll state for each folder. |
| POST | `/api/watcher/poll` | Queue an immediate poll. It still only reads from AEM. Returns 202. |
| GET | `/api/stream` | Server-Sent Events. |

Invalid request bodies return 400 with the zod issues. Events are stored per folder, so two campaigns bound to the same folder share its events.

`/api/stream` sends these event types:

| Event | Payload |
|---|---|
| `health` | Watcher health. Sent on connect and after each poll. |
| `change` | New change events, plus the IDs of the campaigns they affect. |
| `campaign` | `created`, `updated`, `reviewed` (with the campaign) or `deleted` (with its ID). |

A `: ping` comment is sent every 15 s to keep the connection open.

## Design

The UI uses Ferrite, a design system exported from Claude Design.

| File | Use |
|---|---|
| `design/tokens.css` | Canonical tokens. `apps/web` imports this file through the `@design` alias. |
| `design/styles.md` | Component recipes and dashboard mappings. |
| `design/design_guidelines.md` | Voice, colour, type, motion and accessibility. |
| `design/source/` | Verbatim Claude Design export. Read-only provenance. Do not edit. |

## Out of scope

- Docker.
- Authentication and multiple users.
- Adobe I/O Events (the watcher polls instead).
- Filesystem watchers (mock mode reads the fixtures on each poll).
