# Ferrite Systems — Brand Report

Source brief for generating `tokens.css`, `styles.md`, and `design_guidelines.md`.
Ferrite is an original, fictional data‑storage brand (HDD, NVMe SSD, rack arrays) for consumer creators through enterprise. It is not derived from any existing company's identity.

Reference implementation: `Ferrite Home.dc.html` (all values below are used there verbatim).

---

## 1. Brand foundation

| Item | Definition |
|---|---|
| Name | Ferrite Systems (short: Ferrite) |
| Origin | Ferrite: the iron‑oxide material used in magnetic recording media |
| Positioning | Storage you can plan around. Measured, specified, predictable |
| Personality | Engineered, candid, calm, exact. Not flashy, not playful |
| Signature motif | **Track rules**: hairline rules with mono index labels (`01 / CAPACITY`), like measurement scales or platter tracks |
| Signature color | **Oxide**, a rust orange‑red taken from magnetic oxide coating |

### Voice & copy
- Lead with the spec, then the benefit: "24 TB. 285 MB/s sustained. Five‑year warranty."
- Short declaratives. No superlatives ("revolutionary", "blazing"), no exclamation marks.
- Use real units with a thin space or normal space: `24 TB`, `285 MB/s`, `2.5M h MTBF`.
- Sentence case for all headings and buttons. UPPERCASE only for mono labels/eyebrows.
- Buttons are verbs: "Configure drive", "Compare specs", "Talk to sales".

---

## 2. Color

All colors are defined as hex (source of truth) with OKLCH equivalents for derivation.

### 2.1 Neutrals: graphite & paper
| Token | Hex | Role |
|---|---|---|
| `--ink-900` | `#14161A` | Primary text, dark surfaces |
| `--ink-800` | `#1E2126` | Raised dark surface (cards on dark) |
| `--ink-700` | `#2A2E35` | Borders on dark, secondary dark surface |
| `--ink-500` | `#5B616B` | Secondary text on light (6.1:1 on paper‑0) |
| `--ink-300` | `#A3A8B0` | Secondary text on dark, disabled on light |
| `--line` | `#D9D8D2` | Hairline rules/borders on light |
| `--paper-200` | `#ECEAE4` | Inset wells, table header fill |
| `--paper-100` | `#F4F3EF` | Alternate section background |
| `--paper-0` | `#FBFAF7` | Page background (warm off‑white, never pure #FFF) |

### 2.2 Brand accent: Oxide
| Token | Hex | Role |
|---|---|---|
| `--oxide-700` | `#7A2E13` | Pressed state, text on oxide‑100 |
| `--oxide-600` | `#963817` | Hover state for primary button/links |
| `--oxide-500` | `#B8471F` | **Primary accent**: CTAs, links, active indicators |
| `--oxide-300` | `#E08A63` | Accent on dark surfaces (text/rules) |
| `--oxide-100` | `#F6E3D9` | Tint backgrounds, selected rows |

Contrast: `#B8471F` on `#FBFAF7` ≈ 5.1:1; `#FBFAF7` on `#B8471F` ≈ 5.1:1. `#E08A63` on `#14161A` ≈ 7.0:1.

### 2.3 Status (functional only, never decorative)
| Token | Hex | Use |
|---|---|---|
| `--status-ok` | `#2E6B4F` | Healthy, in stock, passed |
| `--status-info` | `#2B5C8A` | Informational notices |
| `--status-warn` | `#9A6200` | Degraded, low stock |
| `--status-error` | `#A3261B` | Failure, validation error |

### 2.4 Usage ratios
- ~80% paper/ink neutrals, ~15% ink‑900 dark bands, ≤5% oxide.
- Oxide is for **one primary action per view** plus active/selected indicators. Never as a large fill behind body text, never as a gradient.
- No gradients anywhere. Flat fills only.

### 2.5 Semantic mapping (recommended for tokens.css)
```
--color-bg:            var(--paper-0)
--color-bg-alt:        var(--paper-100)
--color-bg-inset:      var(--paper-200)
--color-bg-inverse:    var(--ink-900)
--color-surface-inverse-raised: var(--ink-800)
--color-text:          var(--ink-900)
--color-text-muted:    var(--ink-500)
--color-text-inverse:  var(--paper-0)
--color-text-inverse-muted: var(--ink-300)
--color-border:        var(--line)
--color-border-strong: var(--ink-900)
--color-border-inverse: var(--ink-700)
--color-accent:        var(--oxide-500)
--color-accent-hover:  var(--oxide-600)
--color-accent-active: var(--oxide-700)
--color-accent-tint:   var(--oxide-100)
--color-accent-on-dark: var(--oxide-300)
--color-focus:         var(--oxide-500)
```

---

## 3. Typography

### 3.1 Families (Google Fonts, open licence)
| Role | Family | Settings |
|---|---|---|
| Display & headings | **Archivo** (variable, `wdth` 62–125, `wght` 100–900) | `font-stretch: 87.5%` (semi‑condensed), weight 700 |
| Body & UI | **Archivo** | `font-stretch: 100%`, weight 400 / 500 / 600 |
| Specs, labels, data | **JetBrains Mono** | weight 400 / 500, `font-variant-numeric: tabular-nums` |

Import:
```
https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=JetBrains+Mono:wght@400;500&display=swap
```
Fallbacks: `Archivo, "Helvetica Neue", Arial, sans-serif` and `"JetBrains Mono", ui-monospace, Menlo, monospace`.

### 3.2 Type scale (px / line-height / tracking)
| Token | Size | LH | Tracking | Family / weight / stretch | Use |
|---|---|---|---|---|---|
| `display-xl` | 88 | 0.95 | -0.03em | Archivo 700 / 87.5% | Hero headline (desktop) |
| `display-l` | 64 | 1.0 | -0.025em | Archivo 700 / 87.5% | Section hero, dark band |
| `h1` | 48 | 1.05 | -0.02em | Archivo 700 / 87.5% | Page titles |
| `h2` | 36 | 1.1 | -0.015em | Archivo 700 / 87.5% | Section titles |
| `h3` | 28 | 1.15 | -0.01em | Archivo 600 / 87.5% | Card titles |
| `h4` | 22 | 1.25 | -0.005em | Archivo 600 / 100% | Sub‑heads |
| `body-l` | 18 | 1.55 | 0 | Archivo 400 | Lead paragraphs |
| `body` | 16 | 1.55 | 0 | Archivo 400 | Default |
| `body-s` | 14 | 1.5 | 0 | Archivo 400 | Secondary, table cells |
| `label` | 12 | 1.3 | 0.08em, UPPERCASE | JetBrains Mono 500 | Eyebrows, track labels, table headers |
| `spec-l` | 36 | 1.0 | -0.02em | JetBrains Mono 500, tabular | Big spec readouts |
| `spec` | 14 | 1.4 | 0 | JetBrains Mono 400, tabular | Inline spec values |

Responsive: below 720px, display‑xl → 52, display‑l → 44, h1 → 36, h2 → 28 (use `clamp()`; e.g. `clamp(52px, 7vw, 88px)`).

### 3.3 Rules
- `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs.
- Max measure 64ch for body copy.
- Numbers in specs, prices, and tables always use the mono family with tabular figures.

---

## 4. Spacing, layout, shape

### 4.1 Spacing (4px base)
`--space-1: 4` · `--space-2: 8` · `--space-3: 12` · `--space-4: 16` · `--space-5: 24` · `--space-6: 32` · `--space-7: 48` · `--space-8: 64` · `--space-9: 96` · `--space-10: 128`

- Section vertical padding: 96 desktop / 64 mobile.
- Card internal padding: 24–32.

### 4.2 Grid
- Max content width **1360px**, page gutter `clamp(20px, 4vw, 48px)`.
- 12 columns, 24px gutter. Common splits: 7/5 (hero), 4/4/4 (product cards), 3/9 (spec labels/values).

### 4.3 Radius
Ferrite is **square‑edged**. Precision over softness.
| Token | Value | Use |
|---|---|---|
| `--radius-0` | 0 | Cards, sections, images, tables |
| `--radius-1` | 2px | Buttons, inputs, segmented controls |
| `--radius-pill` | 999px | Status pills only |

### 4.4 Borders & elevation
- Structure comes from **1px hairlines** (`--line` on light, `--ink-700` on dark), not shadows.
- `--border-hair: 1px solid var(--line)`; `--border-strong: 1px solid var(--ink-900)`.
- Shadows: one level only, for floating UI (menus, popovers): `0 8px 24px -8px rgba(20,22,26,0.18)`. Cards have no shadow.

---

## 5. Signature motif: track rules

The brand's recognizable device. Use at the top of every section and in spec lists.

```
01 / CAPACITY ───────────────────────────────────────── 24 TB
```
- A mono `label` (index + name), a flexible 1px rule, an optional right‑aligned mono value.
- Index numbers are two digits, zero‑padded, separated by ` / `.
- On light: label `--ink-500`, rule `--line`. On dark: label `--ink-300`, rule `--ink-700`.
- Active/selected track: rule becomes 2px `--oxide-500`.

---

## 6. Components (as implemented in the example page)

### Buttons
| Variant | Fill | Text | Border | Hover | Height / padding |
|---|---|---|---|---|---|
| Primary | `--oxide-500` | `--paper-0` | none | `--oxide-600` | 48 / 0 24, radius 2, Archivo 600 15px |
| Secondary | transparent | `--ink-900` | 1px `--ink-900` | fill `--ink-900`, text `--paper-0` | same |
| Ghost / link | none | `--oxide-500` | none | `--oxide-600` + underline | Archivo 600, trailing `→` |
| On dark primary | `--oxide-500` | `--paper-0` | none | `--oxide-600` | same |
| On dark secondary | transparent | `--paper-0` | 1px `--ink-300` | border `--paper-0` | same |

Small size: 36 high, padding 0 16, 14px.
Focus: `outline: 2px solid var(--oxide-500); outline-offset: 2px` on all interactive elements.

### Segmented capacity selector
- Row of equal buttons, 1px `--ink-900` outer border, 1px dividers, radius 2 on outer corners only.
- Unselected: transparent, `--ink-900` mono text. Selected: `--ink-900` fill, `--paper-0` text.
- Mono 14px, height 44.

### Product card
- Background `--paper-0`, 1px `--line` border, radius 0, padding 32.
- Top: mono label (`HDD`, `NVMe SSD`, `ARRAY`) + status pill if relevant.
- Image area 4:3, `--paper-200` fill.
- Title h3, one‑line body‑s description, a 3‑row spec list (track rule rows), ghost link CTA.
- Hover: border becomes `--ink-900`. No lift/shadow.

### Spec table
- Full‑width, radius 0. Header row: `--paper-200` fill, mono label style.
- Rows separated by 1px `--line`; cell padding 16 / 20.
- First column Archivo 500 body‑s; value columns mono 14 tabular, right‑aligned when numeric.
- Highlighted column: `--oxide-100` background, header text `--oxide-700`.

### Status pill
- Radius pill, height 22, padding 0 10, mono 11px uppercase 0.06em.
- Fill = status color at full strength, text `--paper-0`. Or outline variant: 1px status color, text status color.

### Navigation
- Height 64, `--paper-0` background, 1px `--line` bottom border, sticky.
- Wordmark left; links Archivo 500 15px `--ink-900`, hover `--oxide-500`; right: secondary small button + primary small button.

### Dark band (enterprise)
- `--ink-900` background, `--paper-0` text, `--ink-300` muted text, `--ink-700` rules, oxide‑300 for accent text.

### Footer
- `--ink-900` background, 4‑column link groups with mono labels, legal line in body‑s `--ink-300`.

---

## 7. Logo / wordmark (spec for a placeholder)

No final logo exists yet. Interim wordmark used in the example:
- "FERRITE" in Archivo 800, `font-stretch: 75%`, tracking 0.04em, uppercase, preceded by a **solid 14×14 oxide square** (the "domain" mark: one magnetic bit).
- Clear space = height of the square on all sides. Minimum width 96px.
- A designed logo should replace this. Keep the square‑bit concept as the brief.

---

## 8. Imagery

- Product photography: isolated hardware on `--paper-200` or `--ink-900`, hard directional light, no reflections or glow effects.
- Environment photography: real studios, server rooms, field kits. Neutral grade, no teal/orange LUTs.
- Never: abstract "data stream" particle art, glowing circuits, stock handshake images.
- Placeholders in the example are striped `--paper-200` boxes with a mono caption describing the required shot.

---

## 9. Motion

- Durations: `--dur-fast: 120ms` (hover/colour), `--dur-base: 200ms` (selection, reveal), `--dur-slow: 320ms` (panels).
- Easing: `--ease-standard: cubic-bezier(0.2, 0, 0, 1)`.
- Spec readouts may count/tween numerically on change; no bouncing, no parallax.
- Respect `prefers-reduced-motion: reduce` by disabling tweens.

---

## 10. Accessibility

- Body text ≥ 4.5:1; all palette pairs listed above pass.
- Never rely on oxide alone to show state; pair with fill change, weight, or icon.
- Hit targets ≥ 44px on touch.
- Focus ring always visible (`:focus-visible`).

---

## 11. Suggested output structure for Claude Code

**tokens.css**
1. Primitive color tokens (§2.1–2.3)
2. Semantic color tokens (§2.5)
3. Font families, type scale as `--font-size-*`, `--line-height-*`, `--tracking-*` (§3.2)
4. Spacing, radius, border, shadow, motion tokens (§4, §9)
5. Optional `[data-theme="dark"]` block remapping semantic tokens to ink surfaces

**styles.md**: component recipes from §6 with token references, plus the track‑rule pattern (§5).

**design_guidelines.md**: §1 voice, §2.4 colour ratios, §3.3 type rules, §7 logo, §8 imagery, §9 motion, §10 accessibility, and do/don't lists:
- Do: hairlines for structure, mono for numbers, one oxide action per view, square corners.
- Don't: gradients, drop shadows on cards, rounded cards, oxide body text on dark ink (use oxide‑300), superlative copy.
