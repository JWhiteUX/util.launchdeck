# Mock AEM fixtures

`AEM_MODE=mock` serves this directory through `MockAemClient`
(`apps/server/src/aem/MockAemClient.ts`). It is read from disk on every poll, with no filesystem watcher.

## Mapping

- `fixtures/aem/content/dam/brand/fall-launch/hero.jpg` is the asset `/content/dam/brand/fall-launch/hero.jpg`.
- Directories are folders, and files are assets.
- Names starting with `_` or `.` are ignored. They hold the control files below.
- `lastModified` is the file's mtime, as a UTC ISO string.
- `format` is a MIME type derived from the extension (`apps/server/src/aem/mime.ts`). Unknown extensions map to `application/octet-stream`.

## Control files (all optional, per folder)

| File | Shape | Effect |
|---|---|---|
| `_folder.json` | `{ "title": "Fall launch" }` | The folder title in `listFolder`. |
| `_meta.json` | `{ "defaultUser": "dev.patel", "assets": { "hero.jpg": { "lastModifiedBy": "maria.chen" } } }` | `jcr:lastModifiedBy`. Assets in subfolders without their own `_meta.json` use the nearest ancestor's `defaultUser`. If no `_meta.json` applies, the user is `admin`. |
| `_audit.json` | `{ "denied": true }` | The audit log is unreadable (`AuditAccessDeniedError`). |
| `_audit.json` | `{ "defaultUser": "x@agency", "users": { "hero.jpg": "maria.chen@agency", "social/post-1.png": "..." } }` | The audit log is readable. Events are synthesized from file mtimes. `users` keys are file names, or paths relative to the folder. |
| *(no `_audit.json`)* | | The audit log is readable but has no events. |

Synthesized audit events work like this. Every asset with an mtime after `since` produces an event:

- The first time a client instance reports an asset, the event is `ASSET_CREATED`.
- Later reports of the same asset are `METADATA_UPDATED`.
- An asset that was reported before and has since been deleted produces `ASSET_REMOVED`.

## Folders

- `brand/fall-launch`: audit-readable, with jpg, png, pdf and mp4 files and a `social/` subfolder.
- `brand/holiday-promo`: audit-denied, so the watcher falls back to `jcr:lastModifiedBy`.
- `brand/empty-soon`: no assets, for the empty-folder (red badge) case.

## Simulating changes while the server runs

```sh
cd fixtures/aem/content/dam/brand
touch fall-launch/hero.jpg                 # modify: bumps mtime → MODIFIED
cp fall-launch/banner.png fall-launch/new.png   # add → ADDED
rm fall-launch/specs.pdf                   # delete → DELETED (restore with: git checkout -- .)
mkdir new-folder && echo '{ "title": "New folder" }' > new-folder/_folder.json   # add a folder
```

Changes show up on the next watcher tick (`WATCH_INTERVAL_SEC`).
