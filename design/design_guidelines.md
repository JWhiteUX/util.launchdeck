# Ferrite design guidelines

Derived from `design/source/Ferrite Brand Report.md` (§1, §2.4, §3.3, §7–§11). Tokens are in `design/tokens.css` and component recipes in `design/styles.md`. Colour values follow the "Clear Oxide" revision in `design/palette-revision.md`, which supersedes the report's §2.

Ferrite Systems is a fictional storage brand, and launchdeck borrows its visual system. Its positioning ("storage you can plan around: measured, specified, predictable") fits a launch-readiness tool, so the voice carries over unchanged.

## Personality
Engineered, candid, calm, exact. Not flashy, not playful.

## Voice & copy
- **Lead with the fact, then the meaning.** Write "3 assets changed. Last edit 14:02 by jdoe.", not "Heads up! Some stuff changed!"
- **Use short declaratives.** No superlatives ("revolutionary", "blazing") and no exclamation marks.
- **Use real units with a space:** `24 TB`, `285 MB/s`, `2 min ago`, `7 days`.
- **Use sentence case** for all headings and buttons. UPPERCASE is only for mono labels, eyebrows, pills and table headers.
- **Buttons are verbs:** "New campaign", "Save campaign", "Mark reviewed", "Add folder".
- **Empty and error states** say what happened and what to do next. Write "No changes since last review.", not "All good! 🎉", and "Watcher can't reach AEM (503). Retrying in 2 min.", not "Oops, something went wrong".

## Colour
- **Ratios:** about 80% paper and ink neutrals, about 15% `--ink-900` dark surfaces, and 5% or less oxide.
- **Oxide** is reserved for **one primary action per view** plus active or selected indicators (focus ring, today marker, selected track). Never use it as a large fill behind body text.
- **Status colours** are functional only: health, change type, validation. Never decorative.
- **No gradients anywhere.** Fills are flat. The only exception is the striped image placeholder.
- **On dark ink surfaces,** use `--oxide-300` for accent text, never `--oxide-500`.
- **Dark theme:** `tokens.css` remaps the semantic tokens for `prefers-color-scheme: dark` and `[data-theme="dark"]`. The app follows the system appearance by default. Dark surfaces use dedicated tokens (`--ink-600` hairlines, `--oxide-900` tint, `--status-*-300` text), never `color-mix()`.

## Typography
- **Archivo** is used for display and headings at weight 700 with semi-condensed stretch (87.5%). It is also used for body and UI at 400, 500 and 600 with normal stretch.
- **JetBrains Mono** is used for labels, specs, dates, counts, file types and paths.
- **Numbers** in specs, tables, timestamps and counts always use mono with `tabular-nums`.
- **Headings** use `text-wrap: balance` and paragraphs use `text-wrap: pretty`.
- **Body copy** has a maximum measure of 64ch.
- **Below 720px,** display and heading sizes step down through the `clamp()` values in the tokens.

## Shape & structure
- **Square-edged:** cards, sections, tables, images and Gantt bars have radius 0. Buttons and inputs have 2px. Only status pills are fully rounded.
- **Structure comes from 1px hairlines,** not shadows. Use `--line` on light surfaces and `--ink-700` on dark.
- **One shadow level,** used only for floating UI (menus, popovers, modals). Cards never have a shadow.
- **Spacing** uses a 4px base and the `--space-*` scale only. Sections get 96px vertical padding on desktop and 64px on mobile. Cards get 24–32px of padding.
- **Grid:** the maximum content width is 1360px, the page gutter is `clamp(20px, 4vw, 48px)`, and the layout has 12 columns with a 24px gutter.

## Signature motif: track rules
Every section opens with a track rule: a mono index label (`01 / TIMELINE`), a flexible hairline, and an optional right-aligned mono value. Indices are two digits and zero-padded. An active or selected track gets a 2px oxide rule. Use the same pattern for spec lists and the watcher health panel.

In launchdeck, section titles drop the index (`TIMELINE`, not `01 / TIMELINE`); the hairline and mono label remain.

## Logo / wordmark
There is no final logo yet. The interim wordmark is a solid 14×14 oxide square (one magnetic bit) followed by the product name in uppercase Archivo 800, 75% stretch, 0.04em tracking. In this app the name is **LAUNCHDECK**. Clear space equals the square's height on all sides, and the minimum width is 96px. A designed logo should keep the square-bit concept.

## Imagery
- **Product imagery** is isolated hardware on paper-200 or ink-900, with hard directional light and no glow.
- **Environment imagery** uses real spaces with a neutral grade.
- **Never** use abstract data-stream particle art, glowing circuits or stock handshake images.
- **Placeholders** are striped inset boxes with a mono caption that describes the required shot.
- **Asset thumbnails** in launchdeck appear inside square, radius-0 frames on `--color-bg-inset`.

## Motion
- **Durations:**

  | Token | Duration | Used for |
  |---|---|---|
  | `--dur-fast` | 120ms | hover and colour changes |
  | `--dur-base` | 200ms | selection and reveal |
  | `--dur-slow` | 320ms | panels and modals |

- **Easing:** all motion uses `--ease-standard` (`cubic-bezier(0.2, 0, 0, 1)`).
- **Counts and spec readouts** may tween numerically. For example, the change count can tick up when a live event arrives. No bouncing and no parallax.
- **Reduced motion:** honour `prefers-reduced-motion: reduce`. The tokens collapse durations to 0ms, so tweens must be disabled too.

## Accessibility
- Body text contrast is at least 4.5:1, and every text pair in use passes. `#C8411B` on `#FCFCFB` is 4.84:1, and `#FF8A5C` on `#121417` is 7.94:1. See `design/palette-revision.md` for the full table.
- **Never put `--color-accent` text on `--color-accent-tint`.** It is 4.30:1. Use ink text on tinted rows and `--oxide-700` for highlighted headers.
- **Never rely on colour alone,** including oxide or status colours. Pair colour with a text label, a fill change, weight or an icon. Status badges always carry a word (`READY`, `3 CHANGES`, `ERROR`).
- Touch hit targets are at least 44px.
- The focus ring is always visible on `:focus-visible`: 2px in the focus colour with a 2px offset.
- The live updates region (the activity feed) uses `aria-live="polite"` so new events are announced without stealing focus.

## Do
- Use hairlines for structure.
- Use mono for numbers, paths, file types and timestamps.
- Use one oxide action per view.
- Keep corners square.
- Write spec-first, plain copy.
- Reference tokens, never hex.

## Don't
- Gradients.
- Drop shadows on cards.
- Rounded cards or bars.
- Oxide-500 text on dark ink (use oxide-300).
- Superlative or exclamatory copy.
- Raw hex values in components.
- More than one primary button in a view.
