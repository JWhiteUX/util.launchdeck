# util.launchdeck

This is a local campaign launch-readiness dashboard for marketers on macOS: a single user with no login. Campaigns appear on a Gantt chart. Each campaign is bound to one or more AEM DAM folders, and a watcher polls those folders to show what changed, when, by whom, and the file type.

The plan of record is in `~/.claude/plans/pasted-content-id-d3b2-task-polished-owl.md`.

## Stack (fixed — do not substitute)
- The repo is a TypeScript monorepo using npm workspaces:
  - `apps/web`: Vite + React, port 3001 (moved from 3000, which a local Docker container uses; override with `WEB_PORT`)
  - `apps/server`: Fastify, port 4000
  - `packages/shared`: types + zod schemas
- SQLite via better-sqlite3 stores campaigns, folder snapshots and change events, with versioned migrations.
- The watcher is a scheduled job inside the server process. It runs every `WATCH_INTERVAL_SEC` seconds (default 60).
- The UI receives live updates via Server-Sent Events.
- The Gantt chart uses frappe-gantt.
- Tests run on vitest. Linting is eslint plus `tsc --noEmit`.

## Working rules
- **Build in phases:** 0 (design ingest), 1 (scaffold and CRUD), 2 (AemClient, mock and diff), 3 (watcher and SSE), 4 (UI), 5 (HttpAemClient and smoke script).
- After each phase, run `npm run lint && npm run typecheck && npm test`. These must exit 0. Then **stop for review**.
- **Don't add dependencies** beyond the stack without asking.
- **Out of scope:** Docker, auth, multi-user, Adobe I/O Events, and filesystem watchers such as chokidar.

## AEM rules
- **AEM is read-only.** Use GET requests only, and never write to AEM in any way. The only POST allowed is the IMS token exchange, which goes to Adobe IMS rather than AEM.
- **Every AEM call goes through the `AemClient` interface.** `AEM_MODE=mock` selects `MockAemClient`, which reads `fixtures/aem/`. `AEM_MODE=live` selects `HttpAemClient`.
- **Flavor and auth** are set by `AEM_FLAVOR=cloud|65` and `AEM_AUTH=devtoken|service|basic`.
- **Rate limits:** retry 429 and 5xx responses with exponential backoff, and cap concurrent AEM requests at 4.
- **Audit log fallback:** if the audit log is unreadable, log one warning per folder and fall back to `jcr:lastModifiedBy`. Never fail the poll for this.
- **Logging:** never log tokens, credentials or full response bodies.
- **Credentials** are read from `.env` only. `.env.example` is committed and `.env` is gitignored.
- **Timestamps** are stored as UTC ISO strings and displayed in local time.

## Design system
The UI uses the **Ferrite** design system, exported from Claude Design.

| File | Use |
|---|---|
| `design/tokens.css` | Canonical tokens. `apps/web` imports this file through the `@design` Vite alias, so there is only one copy. |
| `design/styles.md` | Component recipes, plus **dashboard mappings** for the badges, Gantt, activity feed, watcher health and modal |
| `design/design_guidelines.md` | Voice, colour ratios, type, motion, accessibility, do/don't |
| `design/palette-revision.md` | "Clear Oxide" colour revision (2026-10-01): supersedes Brand Report §2, with an old → new hex table and contrast notes |
| `design/source/` | Verbatim Claude Design export (brand report, reference `.dc.html` and its runtime). **Read-only provenance; do not edit.** |

Rules when writing UI:
- Use tokens only. No raw hex values in components or CSS outside `tokens.css`.
- Corners are square. Only buttons and inputs get 2px radius, and only pills are fully rounded.
- Use hairlines instead of shadows. The single shadow token is for floating UI only.
- Numbers, dates, paths and file types use mono with tabular figures.
- Allow one oxide primary action per view. Use sentence-case verb buttons and UPPERCASE mono labels.
- Never convey state by colour alone. Badges always include a text label.
- Respect `prefers-reduced-motion`.
