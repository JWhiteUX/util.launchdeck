# design/source — Claude Design export (read-only)

Verbatim export from Claude Design, added 2026-09-30. Do not edit these files; they are the provenance for everything in `design/`.

| File | Purpose |
|---|---|
| `Ferrite Brand Report.md` | Brand spec (source of truth for all token values) |
| `Ferrite Home.dc.html` | Reference page using every value verbatim |
| `support.js` | Generated Claude Design runtime (`dc-runtime`) that renders `.dc.html`. Loads React and Babel from unpkg. Not app code. |

Ferrite Systems is a fictional brand created for design exploration. This project uses it as its visual system.

## Viewing the reference page

The runtime fetches the page over HTTP, so serve the folder rather than opening the file directly:

```sh
npx serve design/source
# then open "Ferrite Home.dc.html"
```

## If the design is updated

Replace these files with the new export, then regenerate `design/tokens.css`, `design/styles.md` and `design/design_guidelines.md` from the report.
