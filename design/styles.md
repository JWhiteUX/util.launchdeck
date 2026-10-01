# Ferrite styles — component recipes

Derived from `design/source/Ferrite Brand Report.md` §5–§6 and the reference page `design/source/Ferrite Home.dc.html`. All values reference tokens in `design/tokens.css`. Rules and rationale live in `design/design_guidelines.md`. Colour values follow the "Clear Oxide" revision (2026-10-01) in `design/palette-revision.md`, which supersedes Brand Report §2.

The **Dashboard mappings** section at the end shows how launchdeck's UI uses these recipes.

---

## Base

```css
body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--font-size-body);
  line-height: var(--line-height-body);
  -webkit-font-smoothing: antialiased;
}
*, *::before, *::after { box-sizing: border-box; }
a { color: var(--color-accent); text-decoration: none; }
a:hover { color: var(--color-accent-hover); text-decoration: underline; }
button, input, select, textarea { font-family: inherit; }
:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
h1, h2, h3, h4 { text-wrap: balance; }
p { text-wrap: pretty; max-width: var(--measure-body); }
```

Font import (in `index.html`):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

## Type roles

| Class | Recipe |
|---|---|
| `.display-xl` / `.display-l` / `.h1` / `.h2` | sans, weight 700, `font-stretch: var(--font-stretch-display)`, matching `--font-size-*`, `--line-height-*` and `--tracking-*` |
| `.h3` | sans 600, stretch display, `--font-size-h3` |
| `.h4` | sans 600, stretch body, `--font-size-h4` |
| `.body-l` / `.body` / `.body-s` | sans 400 |
| `.label` | mono 500, `--font-size-label`, `--tracking-label`, `text-transform: uppercase`, colour `--color-text-muted` |
| `.spec-l` | mono 500, `--font-size-spec-l`, `--tracking-spec-l`, `font-variant-numeric: tabular-nums` |
| `.spec` | mono 400, `--font-size-spec`, tabular-nums |

Any number in a spec, table, date or count uses mono with tabular figures.

## Track rule (signature motif, §5)

```
01 / CAPACITY ───────────────────────────────────────── 24 TB
```

```html
<div class="track">
  <span class="label">01 / CAPACITY</span>
  <span class="track__rule"></span>
  <span class="track__value">24 TB</span>
</div>
```

```css
.track { display: flex; align-items: center; gap: var(--space-4); }
.track__rule { flex: 1; height: 1px; background: var(--color-border); }
.track__value { font-family: var(--font-mono); font-size: var(--font-size-label); letter-spacing: var(--tracking-label); color: var(--color-text-muted); }
.track[aria-current="true"] .track__rule { height: 2px; background: var(--color-accent); }
```

- The index is two digits, zero-padded, followed by ` / ` and the name in uppercase.
- Use a track rule at the top of every section, with `margin-bottom: var(--space-5)` or `var(--space-6)`.
- **Spec-list row variant:** use `padding: var(--space-3) 0; border-bottom: var(--border-hair)` with a mono `--font-size-spec` value on the right. Put a flex spacer between the label and the value instead of a rule line.
- On a dark band, the rule uses `--ink-700` and the label uses `--ink-300`.

## Buttons (§6)

| Variant | Fill | Text | Border | Hover |
|---|---|---|---|---|
| Primary | `--color-accent` | `--color-on-accent` | none | fill `--color-accent-hover` |
| Secondary | transparent | `--color-text` | `var(--border-strong)` | fill `--color-text`, text `--color-bg` |
| Ghost / link | none | `--color-accent` | none | `--color-accent-hover` + underline, trailing `→` |
| On dark, secondary | transparent | `--paper-0` | 1px `--ink-300` | border `--paper-0` |

The default size is `height: var(--control-h); padding: 0 var(--space-5); border-radius: var(--radius-1);` with sans 600 at `--font-size-button`. The small size is `var(--control-h-s)`, padding `0 var(--space-4)`, at `--font-size-button-s`. Transitions run for `var(--dur-fast)` with `var(--ease-standard)`. Use **one primary button per view**.

Destructive actions use the secondary style with text and border in `--status-error`. They never use an oxide fill.

## Segmented control

- The row is `display: flex; border: var(--border-strong); border-radius: var(--radius-1);`.
- Each item is `flex: 1; height: var(--control-h-segmented);` in mono `--font-size-spec`, with a `1px` left divider in `--color-border-strong` on every item except the first.
- **Unselected:** transparent fill, `--color-text`.
- **Selected:** `--color-text` fill and `--color-bg` text, with `aria-pressed="true"`.
- `background` transitions over `var(--dur-base)`.

## Card

- The base is `background: var(--color-bg); border: var(--border-hair); border-radius: var(--radius-0); padding: var(--space-6);` laid out as a column with `gap: 20px`.
- Hover sets `border-color: var(--color-border-strong)`, transitioning over `var(--dur-fast)`. There is no lift and no shadow.
- The top row holds a mono label on the left and an optional status pill on the right.

## Spec table / data table

- The wrapper is `border: var(--border-hair); overflow-x: auto;`. The table uses `border-collapse: collapse; width: 100%`.
- **Header row:** `--color-bg-inset` fill, label style (mono 12, uppercase, tracking), `font-weight: 500`, padding `var(--space-4) 20px`.
- **Rows:** `border-top: var(--border-hair)`, with cell padding `var(--space-4) 20px`.
- **First column:** sans 500, `--font-size-body-s`.
- **Value columns:** mono `--font-size-spec`, tabular-nums, right-aligned when numeric.
- **Highlighted column or selected row:** `--color-accent-tint` fill, with header text in `--oxide-700`.

## Status pill

```css
.pill { display: inline-flex; align-items: center; height: var(--pill-h); padding: 0 10px;
        border-radius: var(--radius-pill); font-family: var(--font-mono); font-size: var(--font-size-pill);
        letter-spacing: var(--tracking-pill); text-transform: uppercase; }
.pill--solid   { background: var(--pill-color); color: var(--paper-0); }
.pill--outline { border: 1px solid var(--pill-fg); color: var(--pill-fg); }
/* --pill-fg is the matching --status-*-fg token: same colour in light, lightened in dark for contrast. */
/* --pill-color ∈ --status-ok | --status-info | --status-warn | --status-error */
```

A pill always contains a text label. Never rely on colour alone.

## Form inputs

- Inputs are `height: var(--control-h); padding: 0 var(--space-4); border: var(--border-hair); border-radius: var(--radius-1); background: var(--color-bg); color: var(--color-text);`.
- Hover sets `border-color: var(--color-border-strong)`. Focus uses the standard focus ring.
- Field labels use `.label` style, placed above the input with `margin-bottom: var(--space-2)`.
- An error sets `border-color: var(--status-error)` and shows a message below in `--font-size-body-s` and `--status-error`.

## Navigation

- The nav is sticky with `height: var(--nav-h); background: var(--color-bg); border-bottom: var(--border-hair);`. Its content is capped at `--content-max` with `--page-gutter` padding.
- The wordmark sits on the left. Links are sans 500 at 15px in `--color-text`, turning `--color-accent` on hover.
- Actions sit on the right: one small secondary button and one small primary button.

## Wordmark (placeholder, §7)

A solid 14×14 square in `--oxide-500` sits beside the product name, with a 10px gap. The name is set uppercase in sans 800 with `font-stretch: var(--font-stretch-wordmark)`, `letter-spacing: 0.04em` and `font-size: 20px`. Keep clear space equal to the square's height. The minimum width is 96px.

## Dark band

A dark band uses `--ink-900` fill and `--paper-0` text. Muted text is `--ink-300`, rules are `--ink-700`, and accent text is `--oxide-300`. Primary buttons keep the oxide fill.

## Floating surfaces (menus, popovers, modals)

- Floating surfaces use `background: var(--color-bg); border: var(--border-hair); box-shadow: var(--shadow-float); border-radius: var(--radius-0);`.
- This is the **only** place a shadow is allowed.
- A modal backdrop is `--ink-900` at 40% opacity, a flat colour with no blur.
- Opening uses an opacity and 8px translate over `var(--dur-slow)`.

## Image placeholder

```css
background: repeating-linear-gradient(135deg, var(--color-bg-inset) 0 12px, var(--placeholder-stripe) 12px 24px);
```
Add a mono caption in the bottom-left that describes the required shot. This stripe pattern is the only gradient-like fill allowed, and only for placeholders.

---

## Dashboard mappings (launchdeck)

### Layout
- Use the nav and wordmark with the name **LAUNCHDECK**. The single primary action in the nav is "New campaign".
- The page structure is:
  1. a track rule, `TIMELINE`, then the Gantt
  2. a track rule, `ACTIVITY`, then the selected campaign's detail
  3. a track rule, `WATCHER`, then the health panel
- **Launchdeck section titles carry no index numbers** (`TIMELINE`, not `01 / TIMELINE`). The brand's indexed track rule is not used in this app.

### Campaign status badge
| State | Pill | Label |
|---|---|---|
| Green: no unreviewed changes | solid `--status-ok` | `READY` |
| Amber: unreviewed changes | solid `--status-warn` | `N CHANGES` |
| Red: watcher error, or folder empty within 7 days of launch | solid `--status-error` | `ERROR` / `EMPTY` |

### Gantt (frappe-gantt overrides in `apps/web/src/styles/gantt.css`)
- **Bars** have square corners (`rx/ry = 0`) and no progress fill. Each campaign gets a categorical colour, `--series-1` to `--series-8`, assigned in creation order so it never changes when others are added. Past eight campaigns, bars fall back to ink; colours are never cycled. Bar labels are sans 500 at 14px in `--color-on-series`.
- **Series colours** come from the "Clear Oxide" revision, with separate dark-mode steps. Checker results are in `design/palette-revision.md`. They are identity only: never status, never oxide.
- **Status** is not drawn on the bars. The list under the chart pairs each campaign's colour swatch and name with its status badge, which always carries text.
- **Height** toggle (`DEFAULT`, `2×`, `3×`) sits beside the scale control. Default fits the campaigns; 2× and 3× reserve at least 8 and 12 rows. The choice is remembered per browser.
- **Grid** lines are hairlines in `--color-border`. Header text uses the mono label style. The weekend or today column uses `--color-bg-alt`.
- **Today marker** is a 2px `--color-accent` vertical line.
- **Selected bar** gets a 2px `--color-accent` outline.
- **No** gradients, rounded bars or drop shadows.

### Activity feed
- Use the data-table recipe with these columns: `TYPE` · `ASSET` · `FILE TYPE` · `USER` · `WHEN`.
- **TYPE** is an outline pill:

  | Event | Pill colour |
  |---|---|
  | ADDED | `--status-ok` |
  | MODIFIED | `--status-info` |
  | DELETED | `--status-error` |

- **ASSET** is sans 500 body-s. A muted mono path appears on a second line.
- **FILE TYPE** is mono spec text (e.g. `image/jpeg`).
- **USER** is sans body-s. When the user came from `jcr:lastModifiedBy`, append a muted mono `JCR` suffix (audit-sourced users have no suffix).
- **WHEN** is mono tabular in local time. The exact UTC value goes in a `title` attribute.
- **Filters** are a row of `<select>` inputs for user and file type, labelled with mono labels. Use the segmented control only when there are 4 or fewer options.
- **"Mark reviewed"** is a secondary button: "New campaign" in the nav is the page's one oxide primary. It is disabled when there is nothing to review.

### Watcher health
Show one track-rule row per folder:

```
FALL-LAUNCH ───────────────────── OK · 2 MIN AGO
HOLIDAY-PROMO ─────────────── AUDIT DENIED · 1 MIN AGO
```

- The value uses `--color-text-muted` normally and `--status-error` with an `ERROR` prefix when there is an error.
- The full error message appears below the row in body-s.
- A `JCR FALLBACK` outline pill in `--status-info` shows when the folder's audit log is unreadable.

### Campaign modal
- Use the floating-surface recipe, with a max width of 560px and a header track rule (`NEW CAMPAIGN` or `EDIT CAMPAIGN`).
- **Fields:** inputs as above, with dates in `<input type="date">` in mono.
- **Folder paths:** a list of mono rows, each with a remove ghost button, plus an "Add folder" secondary small button that opens the picker.
- **Footer:**
  - "Save campaign" (primary) and "Cancel" (secondary).
  - "Delete campaign" (destructive secondary) is left-aligned. Clicking it turns the footer into an inline confirmation ("Delete permanently" / "Keep").

### Scrollbars
Thin, with a `--color-border` thumb on a transparent track (`--color-text-muted` on hover). `color-scheme` is set in `tokens.css`, so native scrollbars follow the theme.
