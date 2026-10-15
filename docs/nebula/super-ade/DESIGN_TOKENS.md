# Super ADE design tokens

**Status:** Proposed. Pending founder approval of the palette decision in [the design contract](SUPER_ADE_DESIGN_CONTRACT.md#15-founder-decisions). Until approved, [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) remains canonical.

This document defines every token the Super ADE shell needs. It extends the existing theme system rather than replacing it. Read [the token architecture](#1-token-architecture-existing) first: most of the work is choosing values for roles that already exist.

## 1. Token architecture (existing)

Nebula already has a three-layer token system. Keep it.

| Layer               | Where                                                                                                                                                                    | What it is                                         | Change in this proposal                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Theme roles         | `packages/shared/src/themePalettes.ts` (`THEME_COLOR_ROLES`, 56 roles)                                                                                                   | Per-theme semantic colors with dark/light variants | New built-in theme values; 6 proposed additive roles                      |
| App-theme variables | `apps/web/src/themePalette.ts` maps each role to `--app-theme-*`                                                                                                         | Runtime CSS variables written by the theme applier | Map the 6 new roles                                                       |
| Component variables | `apps/web/src/index.css` (`--primary`, `--accent`, `--ring`, `--sidebar-*`, `--radius-*`, `--control-radius`, ...) and the `@theme inline` Tailwind bridge (`--color-*`) | What components consume through Tailwind utilities | Point `--success`/`--info` at the new roles; add motion and layout tokens |

Rules that already hold and must keep holding:

- Components consume semantic utilities (`bg-primary`, `text-muted-foreground`, `border-border`, `bg-sidebar-row-selected`). **No hex or oklch literals inside components.**
- `--primary` is the theme's **action** color (`messageAction`). `--accent` is the **selection surface** (`accentSurface`). `--ring` is `focus`. Do not collapse these.
- Custom themes, theme halves, glass opacity, typography overrides, and `t3code:*` storage keys keep working unchanged.

## 2. Palette strategy

### 2.1 The decision being made

The current canonical palette is navy + **Solar Coral** (`DESIGN_SYSTEM.md`). That document explicitly supersedes an earlier violet/blue proposal. The approved North Star mockup reintroduces **near-black charcoal + nebula violet + ion blue**. Adopting it is a deliberate brand revision, not a token tweak.

### 2.2 Recommended migration: additive theme, new default

| Step                                                                                                               | Behavior                                                             |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Add built-in theme `nebula-ion` (label **"Nebula Ion"**) with the values in [section 3](#3-nebula-ion-role-values) | Additive; no existing theme changes                                  |
| Change the fresh-client default in `useTheme.ts` (`DEFAULT_THEME_SNAPSHOT.theme`) from `nebula` to `nebula-ion`    | Users with **no stored preference** see the new look                 |
| Keep `nebula` (coral) as a selectable built-in, relabelled **"Nebula Solar"** in the picker only                   | Users who **explicitly chose** `nebula` keep exactly what they chose |
| Add `nebula-ion` to `RESERVED_THEME_IDS`                                                                           | Prevents a custom theme from claiming the id                         |
| Update `DESIGN_SYSTEM.md` palette section only after approval                                                      | Single canonical source again                                        |

Why not edit `nebula` in place: a stored `t3code:theme = "nebula"` is indistinguishable from an explicit choice, and the brief forbids breaking user-selected themes.

**Codex must verify before shipping:**

1. Whether any code path persists the default theme id on first boot. If it does, the "no stored preference" population is smaller than expected; report it rather than migrating stored values.
2. How a custom theme whose id later becomes reserved is loaded (the existing `RESERVED_THEME_IDS` path). Add a test for a pre-existing custom theme named `nebula-ion`.
3. Desktop `setTheme` bridge and mobile palette parity (mobile keeps its inherited default per `DESIGN_SYSTEM.md`).

### 2.3 Brand color distribution

| Family                                                     | Target share | Used for                                                        |
| ---------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| Charcoal neutrals (canvas → overlay)                       | ~88%         | Everything structural                                           |
| Nebula Violet (`accent`, `messageAction`, `accentSurface`) | ~8%          | The one primary action per region, selection, active navigation |
| Ion Blue (`focus`, `info`, `update`)                       | ~3%          | Keyboard focus, informational status, links, updates            |
| Semantic status (success, warning, error)                  | as needed    | State only; never decoration                                    |

One region gets at most one solid-violet control. The mockup's "Connect providers" gradient button is the **only** sanctioned gradient (token `--brand-gradient`, below). It appears once in the shell, never inside dense work surfaces.

### 2.4 Status color semantics

Status families are independent from brand hues. Two existing collisions must be resolved:

| Existing usage                                                                                            | Problem under the new palette                   | Resolution                                                                                           |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Thread pill "Plan Ready" is Tailwind `violet`                                                             | Reads as a brand/selection highlight            | Keep violet hue but always pair with the plan icon and label; never use solid violet fill for status |
| Thread pills "Working"/"Connecting"/"Monitoring" are Tailwind `sky`; AgentsPanel "Working" uses `bg-info` | Two different blues for one meaning             | Route all activity states through `info`                                                             |
| `--success`/`--info` are hard-wired to `emerald-500`/`blue-500` in `index.css`                            | Not themeable; custom themes can't fix contrast | Back them with the proposed `success*`/`info*` roles                                                 |
| Provider status dot "disabled" uses `bg-amber-400`                                                        | Disabled looks like a warning                   | Disabled uses `iconMuted` hollow dot                                                                 |

## 3. Nebula Ion role values

All values are OKLCH (the format `themePalettes.ts` already uses), with sRGB hex for design tools. Hue 278 is the charcoal family (very low chroma, slightly cool), 287 is Nebula Violet, 248–252 is Ion Blue.

The last six rows are **proposed additive roles** (`success`, `successForeground`, `successSurface`, `info`, `infoForeground`, `infoSurface`). Adding roles changes the theme-file schema, so:

- Make them optional in parsing. When a theme (custom or imported) lacks them, derive them from the current hard-wired defaults (`emerald-500`, `blue-500`) so existing themes render exactly as today.
- The guided theme editor does not need to expose them in V1.

| Role                       | Dark                     | Dark hex  | Light                    | Light hex |
| -------------------------- | ------------------------ | --------- | ------------------------ | --------- |
| `canvas`                   | `oklch(0.155 0.012 278)` | `#0b0c11` | `oklch(0.985 0.003 278)` | `#f9fafc` |
| `chrome`                   | `oklch(0.172 0.014 278)` | `#0e0f16` | `oklch(0.968 0.006 278)` | `#f3f4f9` |
| `toolbar`                  | `oklch(0.172 0.014 278)` | `#0e0f16` | `oklch(0.985 0.003 278)` | `#f9fafc` |
| `toolbarForeground`        | `oklch(0.965 0.006 278)` | `#f2f3f8` | `oklch(0.205 0.02 278)`  | `#151620` |
| `toolbarBorder`            | `oklch(0.255 0.018 278)` | `#21222c` | `oklch(0.91 0.009 278)`  | `#e0e1e7` |
| `toolbarControl`           | `oklch(0.218 0.018 278)` | `#181923` | `oklch(1 0 0)`           | `#ffffff` |
| `toolbarControlForeground` | `oklch(0.965 0.006 278)` | `#f2f3f8` | `oklch(0.205 0.02 278)`  | `#151620` |
| `toolbarControlHover`      | `oklch(0.25 0.02 278)`   | `#1f212b` | `oklch(0.955 0.008 278)` | `#eff0f6` |
| `surface`                  | `oklch(0.188 0.016 278)` | `#12131b` | `oklch(1 0 0)`           | `#ffffff` |
| `surfaceRaised`            | `oklch(0.218 0.018 278)` | `#181923` | `oklch(0.976 0.004 278)` | `#f6f7fa` |
| `surfaceOverlay`           | `oklch(0.238 0.02 278)`  | `#1c1e28` | `oklch(1 0 0)`           | `#ffffff` |
| `text`                     | `oklch(0.965 0.006 278)` | `#f2f3f8` | `oklch(0.205 0.02 278)`  | `#151620` |
| `textMuted`                | `oklch(0.755 0.018 278)` | `#acafbb` | `oklch(0.47 0.02 278)`   | `#585a66` |
| `border`                   | `oklch(0.285 0.02 278)`  | `#282934` | `oklch(0.9 0.01 278)`    | `#dcdde5` |
| `input`                    | `oklch(0.33 0.024 278)`  | `#323442` | `oklch(0.84 0.014 278)`  | `#c8cad4` |
| `focus`                    | `oklch(0.72 0.15 252)`   | `#57a8ff` | `oklch(0.55 0.17 252)`   | `#0072cd` |
| `accent`                   | `oklch(0.565 0.215 287)` | `#7454ea` | `oklch(0.52 0.22 287)`   | `#6843dd` |
| `accentForeground`         | `oklch(0.99 0.004 287)`  | `#fbfbfe` | `oklch(1 0 0)`           | `#ffffff` |
| `secondary`                | `oklch(0.238 0.02 278)`  | `#1c1e28` | `oklch(0.955 0.008 278)` | `#eff0f6` |
| `secondaryForeground`      | `oklch(0.965 0.006 278)` | `#f2f3f8` | `oklch(0.205 0.02 278)`  | `#151620` |
| `muted`                    | `oklch(0.218 0.018 278)` | `#181923` | `oklch(0.968 0.006 278)` | `#f3f4f9` |
| `mutedForeground`          | `oklch(0.755 0.018 278)` | `#acafbb` | `oklch(0.47 0.02 278)`   | `#585a66` |
| `placeholder`              | `oklch(0.64 0.018 278)`  | `#898b97` | `oklch(0.56 0.018 278)`  | `#72747f` |
| `secondaryLabel`           | `oklch(0.755 0.018 278)` | `#acafbb` | `oklch(0.47 0.02 278)`   | `#585a66` |
| `iconMuted`                | `oklch(0.68 0.018 278)`  | `#9597a4` | `oklch(0.52 0.018 278)`  | `#666874` |
| `error`                    | `oklch(0.7 0.18 22)`     | `#fa686a` | `oklch(0.53 0.19 27)`    | `#c22826` |
| `errorForeground`          | `oklch(0.83 0.09 18)`    | `#fdb0b1` | `oklch(0.45 0.16 27)`    | `#9b1f1d` |
| `errorSurface`             | `oklch(0.235 0.05 20)`   | `#321314` | `oklch(0.965 0.02 25)`   | `#ffefee` |
| `warning`                  | `oklch(0.81 0.14 78)`    | `#f2b54a` | `oklch(0.56 0.13 62)`    | `#a96000` |
| `warningForeground`        | `oklch(0.9 0.09 83)`     | `#fbd999` | `oklch(0.48 0.11 60)`    | `#894c06` |
| `warningSurface`           | `oklch(0.26 0.045 78)`   | `#302107` | `oklch(0.97 0.03 82)`    | `#fff4e0` |
| `update`                   | `oklch(0.7 0.15 248)`    | `#45a4f6` | `oklch(0.53 0.16 252)`   | `#006cc3` |
| `updateForeground`         | `oklch(0.86 0.08 245)`   | `#a9d7ff` | `oklch(0.46 0.14 252)`   | `#0059a1` |
| `updateSurface`            | `oklch(0.25 0.055 250)`  | `#0a233b` | `oklch(0.95 0.025 250)`  | `#e2f0ff` |
| `accentSurface`            | `oklch(0.265 0.06 287)`  | `#242041` | `oklch(0.945 0.028 287)` | `#ebeaff` |
| `accentSurfaceForeground`  | `oklch(0.965 0.006 278)` | `#f2f3f8` | `oklch(0.205 0.02 278)`  | `#151620` |
| `messageSurface`           | `oklch(0.218 0.022 282)` | `#181924` | `oklch(0.955 0.014 287)` | `#efeff9` |
| `messageForeground`        | `oklch(0.965 0.006 278)` | `#f2f3f8` | `oklch(0.205 0.02 278)`  | `#151620` |
| `messageAction`            | `oklch(0.565 0.215 287)` | `#7454ea` | `oklch(0.52 0.22 287)`   | `#6843dd` |
| `messageActionForeground`  | `oklch(0.99 0.004 287)`  | `#fbfbfe` | `oklch(1 0 0)`           | `#ffffff` |
| `messageActionHover`       | `oklch(0.525 0.22 287)`  | `#6945df` | `oklch(0.48 0.21 287)`   | `#5d39ca` |
| `codeBackground`           | `oklch(0.172 0.014 278)` | `#0e0f16` | `oklch(0.968 0.006 278)` | `#f3f4f9` |
| `codeForeground`           | `oklch(0.965 0.006 278)` | `#f2f3f8` | `oklch(0.205 0.02 278)`  | `#151620` |
| `sidebar`                  | `oklch(0.172 0.014 278)` | `#0e0f16` | `oklch(0.968 0.006 278)` | `#f3f4f9` |
| `sidebarForeground`        | `oklch(0.965 0.006 278)` | `#f2f3f8` | `oklch(0.205 0.02 278)`  | `#151620` |
| `sidebarMutedForeground`   | `oklch(0.755 0.018 278)` | `#acafbb` | `oklch(0.47 0.02 278)`   | `#585a66` |
| `sidebarControlSurface`    | `oklch(0.205 0.016 278)` | `#15171f` | `oklch(0.945 0.008 278)` | `#ebecf2` |
| `sidebarRowHover`          | `oklch(0.215 0.018 278)` | `#171922` | `oklch(0.945 0.008 278)` | `#ebecf2` |
| `sidebarRowActive`         | `oklch(0.235 0.03 285)`  | `#1c1c2c` | `oklch(0.935 0.016 287)` | `#e8e8f4` |
| `sidebarRowSelected`       | `oklch(0.25 0.05 287)`   | `#201d38` | `oklch(0.935 0.03 287)`  | `#e8e7fd` |
| `sidebarBorder`            | `oklch(0.255 0.018 278)` | `#21222c` | `oklch(0.91 0.009 278)`  | `#e0e1e7` |
| `terminalBackground`       | `oklch(0.145 0.01 278)`  | `#090a0e` | `oklch(0.985 0.003 278)` | `#f9fafc` |
| `terminalForeground`       | `oklch(0.93 0.008 278)`  | `#e6e7ed` | `oklch(0.205 0.02 278)`  | `#151620` |
| `terminalCursor`           | `oklch(0.76 0.13 290)`   | `#b0a2fe` | `oklch(0.52 0.22 287)`   | `#6843dd` |
| `terminalSelection`        | `oklch(0.3 0.06 287)`    | `#2c284a` | `oklch(0.92 0.035 287)`  | `#e2e2fb` |
| `terminalScrollbar`        | `oklch(0.33 0.024 278)`  | `#323442` | `oklch(0.86 0.012 278)`  | `#cfd0d9` |
| `terminalScrollbarHover`   | `oklch(0.64 0.018 278)`  | `#898b97` | `oklch(0.8 0.014 278)`   | `#bbbdc7` |
| `success`                  | `oklch(0.76 0.16 156)`   | `#42ce85` | `oklch(0.52 0.13 156)`   | `#007e49` |
| `successForeground`        | `oklch(0.88 0.09 156)`   | `#a7eabf` | `oklch(0.45 0.11 156)`   | `#00663a` |
| `successSurface`           | `oklch(0.24 0.045 158)`  | `#092617` | `oklch(0.96 0.03 156)`   | `#e3f8e9` |
| `info`                     | `oklch(0.7 0.15 248)`    | `#45a4f6` | `oklch(0.53 0.16 252)`   | `#006cc3` |
| `infoForeground`           | `oklch(0.86 0.08 245)`   | `#a9d7ff` | `oklch(0.46 0.14 252)`   | `#0059a1` |
| `infoSurface`              | `oklch(0.25 0.055 250)`  | `#0a233b` | `oklch(0.95 0.025 250)`  | `#e2f0ff` |

### 3.1 Contrast audit

Computed with `culori` `wcagContrast` (the library `themePalette.ts` already depends on). Targets are WCAG 2.2 AA: 4.5:1 for text, 3:1 for non-text UI (focus rings, status dots, icons). Primary body text targets 7:1. **Every pair passes in both variants.**

| Pair                                                |  Dark | Light | Target |
| --------------------------------------------------- | ----: | ----: | -----: |
| `text` on `canvas`                                  | 17.66 | 17.18 |    7:1 |
| `text` on `surface`                                 | 16.76 | 17.95 |    7:1 |
| `textMuted` on `surfaceRaised`                      |  7.96 |  6.39 |  4.5:1 |
| `toolbarForeground` on `toolbar`                    | 17.23 | 17.18 |    7:1 |
| `toolbarControlForeground` on `toolbarControlHover` | 14.48 | 15.73 |  4.5:1 |
| `sidebarForeground` on `sidebarRowSelected`         | 14.60 | 14.75 |  4.5:1 |
| `sidebarMutedForeground` on `sidebar`               |  8.71 |  6.24 |  4.5:1 |
| `sidebarMutedForeground` on `sidebarRowHover`       |  8.01 |  5.82 |  4.5:1 |
| `accentForeground` on `accent`                      |  4.84 |  6.08 |  4.5:1 |
| `messageActionForeground` on `messageActionHover`   |  5.78 |  7.21 |  4.5:1 |
| `accentSurfaceForeground` on `accentSurface`        | 14.01 | 15.21 |  4.5:1 |
| `messageForeground` on `messageSurface`             | 15.75 | 15.71 |  4.5:1 |
| `errorForeground` on `errorSurface`                 |  9.67 |  7.25 |  4.5:1 |
| `warningForeground` on `warningSurface`             | 11.53 |  6.20 |  4.5:1 |
| `updateForeground` on `updateSurface`               | 10.53 |  6.21 |  4.5:1 |
| `successForeground` on `successSurface`             | 11.68 |  6.34 |  4.5:1 |
| `infoForeground` on `infoSurface`                   | 10.53 |  6.21 |  4.5:1 |
| `error` on `surface`                                |  6.40 |  5.82 |    3:1 |
| `warning` on `surface`                              | 10.12 |  4.83 |    3:1 |
| `success` on `surface`                              |  9.23 |  5.17 |    3:1 |
| `info` on `surface`                                 |  6.99 |  5.31 |    3:1 |
| `focus` on `canvas`                                 |  7.89 |  4.68 |    3:1 |
| `focus` on `surfaceRaised`                          |  7.03 |  4.56 |    3:1 |
| `terminalForeground` on `terminalBackground`        | 16.10 | 17.18 |    7:1 |
| `codeForeground` on `codeBackground`                | 17.23 | 16.35 |    7:1 |
| `placeholder` on `surface`                          |  5.50 |  4.67 |    3:1 |
| `iconMuted` on `surface`                            |  6.43 |  5.52 |    3:1 |

Notes:

- Dark `messageActionHover` deliberately goes **deeper**, not lighter. A lighter violet (`L 0.61`) dropped white label contrast to 3.97:1 in testing.
- `border` on `surface` is ~1.3:1 by design (hairlines). Borders never carry meaning alone; inputs use `input` (≥1.5:1) plus a focus ring.
- Codex should add the audit pairs above to `themePalette.test.ts` as assertions so future edits cannot regress them.

### 3.2 Derived brand tokens (CSS only, not theme roles)

These are composed from roles with `color-mix`, so custom themes inherit sensible values automatically. Define them once in `index.css` under `html[data-theme-id]`.

| Token                 | Definition                                                                                                                              | Use                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `--brand-violet-text` | `color-mix(in oklch, var(--primary) 55%, var(--foreground))`                                                                            | Violet-tinted labels on dark surfaces (active tab label, selected count) |
| `--brand-gradient`    | `linear-gradient(135deg, var(--primary), var(--info))`                                                                                  | The single "Connect providers" CTA only                                  |
| `--glow-focus`        | `0 0 0 1px color-mix(in oklch, var(--ring) 70%, transparent), 0 0 0 4px color-mix(in oklch, var(--ring) 22%, transparent)`              | Composer and command palette when focused                                |
| `--glow-active`       | `0 0 0 1px color-mix(in oklch, var(--primary) 45%, transparent), 0 8px 28px -14px color-mix(in oklch, var(--primary) 55%, transparent)` | Active primary surface (focused composer, selected tool tile)            |
| `--hairline`          | `color-mix(in oklch, var(--border) 70%, transparent)`                                                                                   | Section dividers inside panels                                           |
| `--scrim`             | `color-mix(in oklch, var(--background) 72%, transparent)`                                                                               | Sheet and dialog backdrop                                                |

Glows render only on focus or active state, never at idle across many elements.

## 4. Typography

Keep the existing platform stacks (`--font-sans`, `--font-mono` in `index.css`) and the Appearance overrides. Geist remains the preferred family once self-hosted assets exist; no network font dependency.

| Token               | Size / line                | Weight | Tracking | Use                                                           |
| ------------------- | -------------------------- | ------ | -------- | ------------------------------------------------------------- |
| `type-display`      | 32 / 40 (36 / 44 at ≥1920) | 600    | -0.02em  | Empty-state hero only ("Build without limits.")               |
| `type-title-lg`     | 20 / 28                    | 600    | -0.01em  | Project title, dialog titles                                  |
| `type-title`        | 16 / 22                    | 600    | -0.005em | Section and panel titles ("Open a surface", "Project notes")  |
| `type-body`         | 14 / 20                    | 400    | 0        | Default reading text, sidebar rows, transcript                |
| `type-body-compact` | 13 / 18                    | 400    | 0        | Dense lists, table cells, tool rail labels                    |
| `type-label`        | 13 / 18                    | 500    | 0        | Buttons, tabs, chips, form labels                             |
| `type-meta`         | 12 / 16                    | 400    | 0        | Secondary lines, timestamps, captions (minimum readable size) |
| `type-micro`        | 11 / 14                    | 500    | 0.01em   | Badges, `kbd`, counters only. Never sentences                 |
| `type-mono`         | 12.5 / 18                  | 400    | 0        | Branches, SHAs, paths, model slugs, commands                  |
| `type-code`         | user `--font-size-code`    | 400    | 0        | Code, terminal, diffs (respect user setting)                  |

Rules: sentence case everywhere (no ALL-CAPS labels in the product shell; the North Star poster's tracked caps are marketing-only). Numerals in counters and timestamps use `font-variant-numeric: tabular-nums`. Truncate paths from the start (`StartTruncatedPath` exists), titles from the end.

## 5. Spacing and density

4px base; Tailwind `--spacing` unit is already 4px.

| Token      | Value | Typical use                                                        |
| ---------- | ----- | ------------------------------------------------------------------ |
| `space-1`  | 4px   | Icon-to-text in micro chips                                        |
| `space-2`  | 8px   | Control inset (`--sidebar-content-inset`, `--command-shell-inset`) |
| `space-3`  | 12px  | Row padding, chip gap, `--floating-content-inset`                  |
| `space-4`  | 16px  | Panel padding, card padding (`--command-content-inset`)            |
| `space-5`  | 20px  | Section gap inside a panel                                         |
| `space-6`  | 24px  | Gap between panels/sections on Project Home                        |
| `space-8`  | 32px  | Page gutters ≥1280px                                               |
| `space-10` | 40px  | Hero breathing room (empty states only)                            |

Density modes are **not** introduced. The existing compact geometry is the default; touch (`pointer: coarse`) already enlarges hit areas to 44px via the button primitive.

## 6. Radius

The existing scale (`--radius: 0.625rem` = 10px; `--radius-sm/md/lg/xl/2xl`) is kept unchanged. This proposal only assigns usage:

| Element                                                     | Token              | Value     |
| ----------------------------------------------------------- | ------------------ | --------- |
| Buttons, inputs, chips, selects, tool tiles' inner controls | `--control-radius` | 8px       |
| Badges, kbd                                                 | `--radius-sm`      | 6px       |
| Cards, list groups, tool tiles, agent cards                 | `--radius-lg`      | 10px      |
| Panels, dialogs, popovers, command palette, sheets          | `--radius-xl`      | 14px      |
| Composer shell                                              | existing 22px      | unchanged |
| Status dots, avatars, pill toggles                          | full               | 9999px    |

## 7. Elevation and surfaces

Hierarchy is carried by surface step first, border second, shadow last.

| Level     | Surface role                                           | Border                                     | Shadow                                                                                   | Examples                                            |
| --------- | ------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 0 Canvas  | `canvas`                                               | none                                       | none                                                                                     | Main workspace background                           |
| 1 Chrome  | `sidebar` / `chrome` / `toolbar`                       | `sidebarBorder` / `toolbarBorder` hairline | none                                                                                     | Sidebar, top toolbar, terminal floor header         |
| 2 Panel   | `surface`                                              | `border`                                   | none                                                                                     | Project Home cards, right context panel, notes list |
| 3 Raised  | `surfaceRaised`                                        | `border`                                   | `0 1px 0 0 rgb(255 255 255 / 3%) inset` (dark only)                                      | Tool tiles, composer body, selected list item       |
| 4 Overlay | `surfaceOverlay` (+ existing glass where already used) | `border`                                   | `0 16px 48px -16px rgb(0 0 0 / 55%)` dark, `0 12px 32px -12px rgb(16 18 32 / 18%)` light | Menus, popovers, dialogs, command palette, toasts   |

Glass (`--glass-blur`, `--glass-opacity`) stays restricted to menus, dialogs, the floating composer and transient surfaces, per `DESIGN_SYSTEM.md`.

**Decorative artwork:** the mockup's planet-horizon glow is permitted **only** as the Project Home empty/new-project hero background, rendered as a static CSS radial gradient (no canvas, no animation, no image request). `sidebarArtwork` stays `false` for `nebula-ion`.

## 8. Motion

| Token              | Duration                                           | Easing                                                                 | Use                                                                           |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `--motion-instant` | 80ms                                               | linear                                                                 | Pressed state, checkbox tick                                                  |
| `--motion-fast`    | 120ms                                              | `cubic-bezier(0.2, 0, 0, 1)`                                           | Hover, focus ring, color changes (matches existing 120ms usage)               |
| `--motion-base`    | 160ms                                              | `cubic-bezier(0.2, 0, 0, 1)`                                           | Popover/menu enter, tab indicator slide, chip add/remove                      |
| `--motion-panel`   | 180ms                                              | `cubic-bezier(0.2, 0, 0, 1)`                                           | Panel open/close, pane layout morph (matches existing view-transition timing) |
| `--motion-sheet`   | 220ms                                              | `cubic-bezier(0.3, 0, 0, 1)` enter / `cubic-bezier(0.4, 0, 1, 1)` exit | Sheets, dialogs, connection flow step change                                  |
| `--motion-status`  | existing `--animate-status-pulse` (2s duty-cycled) | stepped                                                                | Live "working" dots only                                                      |

Rules:

- Animate `opacity` and `transform` only. Width changes for resizable panels follow the pointer directly (no easing during drag).
- Every animation is interruptible: re-opening during an exit reverses from the current frame.
- Exit is ~70% of enter duration.
- `prefers-reduced-motion: reduce` and the existing `.no-transitions` class: no transforms, crossfade ≤80ms or instant; status pulse becomes a static dot plus text.
- Nothing animates while idle. The North Star's orbital glow, starfields and sparkles are static.

## 9. Layout tokens

Most shell dimensions already exist and are persisted. **Reuse them; do not introduce a parallel width system.**

| Dimension              | Value                                                                                             | Status         | Source                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------- |
| Sidebar width          | 256px default, 208px min, main content keeps ≥640px; offcanvas collapse; double-click rail resets | Existing       | `threadSidebarWidth.ts` (`chat_thread_sidebar_width`) |
| Top toolbar height     | 52px                                                                                              | Existing       | `--workspace-topbar-height` (WCO overrides handled)   |
| Right context panel    | Persisted per thread; preview shell default 540px, min 360px, max 70% viewport                    | Existing       | `PreviewPanelShell.tsx`, `rightPanelStore.ts`         |
| Right panel as sheet   | `w-[min(42vw,28rem)] min-w-80`, applies ≤980px                                                    | Existing       | `rightPanelLayout.ts`                                 |
| Terminal floor         | 280px default, 180px min, 75% max                                                                 | Existing       | `ThreadTerminalDrawer.tsx`                            |
| Page container         | `readable` 896 / `wide` 1024 / `expanded` 1152px                                                  | Existing       | `WorkspacePageContainer.tsx`                          |
| `--content-max-width`  | 1152px (= `expanded`)                                                                             | Proposed alias | Project Home column                                   |
| `--composer-max-width` | 768px (`48rem`)                                                                                   | Existing       | Composer and `chat-composer-context-strip`            |
| `--tool-tile-min`      | 148px                                                                                             | Proposed       | Tool tile grid column minimum (container query)       |
| Row height             | 32px (`h-8`), 28px `sm`                                                                           | Existing       | `SidebarMenuButton` sizes                             |
| Control height         | 32px default (`sm:h-8`), 28px `sm`, 36px `lg`                                                     | Existing       | `button.tsx` sizes                                    |

## 10. Breakpoints

| Name        | Width       | Shell behavior                                                                                                                   |
| ----------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `compact`   | < 768px     | Sidebar becomes a sheet; context panel becomes a sheet; one surface at a time; composer docks to bottom                          |
| `laptop`    | 768–1279px  | Sidebar visible (collapsible); context panel closed by default; it opens as a sheet ≤980px (existing threshold) and docked above |
| `desktop`   | 1280–1919px | Sidebar + main + docked context panel                                                                                            |
| `wide`      | 1920–2559px | Context panel open by default; Project Home uses 2-column body                                                                   |
| `ultrawide` | ≥ 2560px    | Optional second work surface (split main); content stays capped at `--content-max-width` per column                              |

Use container queries for panel-internal layouts (tool tile grid, composer footer). The composer already switches at 620px/780px container widths (`composerFooterLayout.ts`); keep those thresholds.

## 11. Z-index scale

| Layer                                 | Value |
| ------------------------------------- | ----- |
| Base content                          | 0     |
| Sticky headers inside panels          | 10    |
| Resize handles                        | 20    |
| Docked panels / terminal floor        | 30    |
| Overlay sheets (laptop context panel) | 40    |
| Popovers, menus, tooltips             | 50    |
| Dialogs                               | 60    |
| Command palette                       | 70    |
| Toasts                                | 80    |

Verify against existing usages before introducing variables; the goal is to name the current order, not reshuffle it.

## 12. Iconography

Lucide only (existing). Stroke 1.75 at 16px, 1.5 at 20px. Sizes: 14px (micro chips), 16px (default controls, sidebar), 18px (tool tiles), 20px (empty states). Provider marks come from `ProviderInstanceIcon` and are never recolored to brand violet.

## 13. Logo and brand mark

The mockup shows a violet/blue cube "N" mark; the approved asset brief in `DESIGN_SYSTEM.md` describes a four-point star with orbital nodes. **No production mark exists for either.** The shell reserves a 24px mark slot (sidebar header) and a 40px slot (Project Home hero) that render the current temporary mark until an approved vector package lands. Do not trace the mockup.
