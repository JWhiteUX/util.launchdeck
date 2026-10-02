# Palette revision: "Clear Oxide" (2026-10-01)

As of 2026-10-01, the colour values in `design/tokens.css` replace the ones in `design/source/Ferrite Brand Report.md` §2. The report stays read-only provenance. For colour, this file and `tokens.css` are the source of truth.

This revision changes colour only. Token names, layout, type, spacing and components are unchanged.

## Why

- **Neutrals mixed warm and cool.** Warm paper tones sat next to cool graphite inks, and they clashed. The neutrals are now a true grey.
- **Oxide read as brown.** The accent has moved toward vermilion so it reads as a clear orange-red.
- **Muted functional colours.** Status and series colours are now clearer and better separated.
- **Dusty dark-theme status colours.** The dark theme's status text colours were `color-mix()` blends of each status colour with 45% paper. They are now dedicated `--status-*-300` tokens, and the dark accent tint and hairline have their own tokens too. No `color-mix()` calls remain in `tokens.css`.

## New tokens

| Token | Value | Use |
|---|---|---|
| `--ink-600` | `#2C3138` | Dark-theme hairline (`--color-border`) |
| `--oxide-900` | `#3D1F14` | Dark-theme accent tint (`--color-accent-tint`) |
| `--status-ok-300` | `#5CC98D` | Dark-theme `--status-ok-fg` |
| `--status-info-300` | `#7AAEF5` | Dark-theme `--status-info-fg` |
| `--status-warn-300` | `#F0A848` | Dark-theme `--status-warn-fg` |
| `--status-error-300` | `#F2867A` | Dark-theme `--status-error-fg` |

## Old → new

### Neutrals

| Token | Old | New |
|---|---|---|
| `--ink-900` | `#14161A` | `#121417` |
| `--ink-800` | `#1E2126` | `#1A1D21` |
| `--ink-700` | `#2A2E35` | `#24282E` |
| `--ink-500` | `#5B616B` | `#5C626C` |
| `--ink-300` | `#A3A8B0` | `#A0A6B0` |
| `--line` | `#D9D8D2` | `#E0E0DD` |
| `--paper-200` | `#ECEAE4` | `#EEEEEC` |
| `--paper-100` | `#F4F3EF` | `#F6F6F5` |
| `--paper-0` | `#FBFAF7` | `#FCFCFB` |
| `--placeholder-stripe` | `#E5E3DC` | `#E6E6E3` |

### Oxide

| Token | Old | New |
|---|---|---|
| `--oxide-700` | `#7A2E13` | `#8A2C0D` |
| `--oxide-600` | `#963817` | `#A8340F` |
| `--oxide-500` | `#B8471F` | `#C8411B` |
| `--oxide-300` | `#E08A63` | `#FF8A5C` |
| `--oxide-100` | `#F6E3D9` | `#FDEBE3` |

### Status

| Token | Old | New |
|---|---|---|
| `--status-ok` | `#2E6B4F` | `#1E7A4C` |
| `--status-info` | `#2B5C8A` | `#2160B5` |
| `--status-warn` | `#9A6200` | `#A65A00` |
| `--status-error` | `#A3261B` | `#C02A1E` |
| Dark `--status-*-fg` | `color-mix(<status> 45%, paper-0)` | `--status-*-300` (above) |

### Dark-theme semantics

| Token | Old | New |
|---|---|---|
| `--color-border` | `--ink-700` | `--ink-600` |
| `--color-accent-tint` | `color-mix(oxide-700 35%, ink-900)` | `--oxide-900` |

### Campaign series

| Token | Light old | Light new | Dark old | Dark new |
|---|---|---|---|---|
| `--series-1` | `#2C5F9E` | `#2D6BCF` | `#528ED9` | `#5B9BF0` |
| `--series-2` | `#3F7A2E` | `#2A7E3B` | `#609F4F` | `#5DB86A` |
| `--series-3` | `#00799A` | `#007FA0` | `#0A9AC3` | `#22B3D6` |
| `--series-4` | `#8C6A00` | `#946A00` | `#AF8504` | `#D9A62A` |
| `--series-5` | `#7A3E8E` | `#8A45AB` | `#AD6FC3` | `#B780D6` |
| `--series-6` | `#00806A` | `#00806A` | `#04A388` | `#2EC0A2` |
| `--series-7` | `#5249A6` | `#5A4FCF` | `#827EE0` | `#8E87F2` |
| `--series-8` | `#B03A6C` | `#C2386F` | `#D55C8C` | `#EE6E9F` |

## Contrast (WCAG)

| Pair | Ratio |
|---|---|
| `--oxide-500` `#C8411B` on `--paper-0` `#FCFCFB` (accent text, primary button) | 4.84:1 |
| `--oxide-300` `#FF8A5C` on `--ink-900` `#121417` (dark accent) | 7.94:1 |
| `--oxide-700` on `--oxide-100` (highlighted headers) | 7.43:1 |
| Tightest series label: `--paper-0` on `--series-3` `#007FA0` | 4.50:1 |
| `--color-accent` on `--color-accent-tint` | 4.30:1. **Don't use for text.** |

Selected rows use ink text on the tint, and highlighted headers use `--oxide-700`. Unreviewed activity rows are not tinted: a 2px `--color-accent` left rule marks them (as on selected campaign rows), because a tint across a fully unreviewed table reads as a brown wash.

## Series palette check

The dataviz palette checker, run on 2026-10-01, gave these results for the new series:

- **Colour-blind separation:** passes in both modes. The worst adjacent pair is ΔE 11.9 in light and 10.6 in dark.
- **Light mode:** `--series-3` and `--series-2` sit right at the normal-vision floor, at ΔE 15.0.
- **Dark mode:** the steps are lighter than the checker's recommended band (OKLCH L 0.68–0.75 against a 0.67 ceiling). That's the trade-off for 6:1+ ink labels.

Every Gantt bar carries its campaign name, so colour is never the only cue.
