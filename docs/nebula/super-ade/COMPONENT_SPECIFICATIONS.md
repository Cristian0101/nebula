# Super ADE component specifications

**Status:** Proposed. [Section 3](#3-provider-connections-components) was rewritten in D0.2 for E3 against delivered E1 readiness and E2 authentication.

Every component has one of three labels:

- **Existing:** use as is.
- **Extend:** an existing component gains presentation or behavior.
- **Proposed:** a new presentation component that composes existing stores and commands.

Props are conceptual. Engineers choose exact types. No component here owns execution state.

Paths are relative to `apps/web/src/components/` unless noted. Tokens refer to [DESIGN_TOKENS.md](DESIGN_TOKENS.md). States refer to [INTERACTION_STATES.md](INTERACTION_STATES.md).

## 0. Spec template

Each entry lists: **Status · Reuses · Anatomy · Sizing · Props (conceptual) · States · Accessibility · Codex verifies**.

## 1. Primitives

### 1.1 `ui/tabs`: Proposed primitive

- **Why:** Tabs are hand-rolled today (`role="tablist"` in Command Deck and Button groups elsewhere). Project header tabs and Notes need one accessible primitive.
- **Reuses:** Base UI tabs (the same library family as the existing `ui/*` primitives). Visual style follows `Toggle` `segmented` for pill tabs and an underline variant for page tabs.
- **Variants:**
  - `underline`: page-level. 36px tall, `type-label`, 2px `primary` indicator that slides with `--motion-base`.
  - `pill`: in-panel. 28px, `accentSurface` selected.
- **Props:** `value`, `onValueChange`, `items[{value, label, icon?, count?, disabled?, disabledReason?}]`, `variant`, `activationMode: "automatic" | "manual"`.
- **Accessibility:** `tablist`/`tab`/`tabpanel` roles, arrow keys, Home/End. A disabled tab stays focusable when it has a `disabledReason` tooltip.
- **Codex verifies:** the indicator respects reduced motion; existing hand-rolled tablists can migrate later (not required).

### 1.2 `ui/badge` → StatusBadge: Extend

- **Reuses:** existing variants `success | warning | error | info | secondary | outline`.
- **Adds:** a `fact` prop taking E1's `ReadinessFact` (`verified | blocked | unknown`) that picks the variant **and** the leading icon from [states §1.1](INTERACTION_STATES.md#11-e1-readiness-facts-delivered), and a `tone` prop for advisories and lifecycle states that are not facts. D0's five-level `met | attention | blocked | unknown | n/a` prop is withdrawn. Text is mandatory.
- **Sizing:** existing `sm` (16–20px) for rows, `default` for headers.
- **Codex verifies:** `info` and `success` variants consume the new theme roles once D1 lands.

### 1.3 StatusDot: Extend `ConnectionStatusDot`

- **Adds:** `tone: success | warning | error | info | muted`, `live?: boolean` (uses existing `--animate-status-pulse`), and `hollow?: boolean` for unknown/disabled.
- **Rule:** a dot is decoration. A text label must be adjacent or provided through `aria-label`/tooltip.
- **Sizing:** 8px dot in a 12px box (existing). 6px variant for avatar overlays.

## 2. Shell

### 2.1 Sidebar brand header: Extend `SidebarChrome` header

- **Anatomy:** 20px mark · "Nebula" (`type-label`, semibold) · "Super ADE" (`type-meta`, muted; hidden when the sidebar is under 232px) · environment pill/artwork (existing modes).
- **Sizing:** height `--workspace-topbar-height` (52px). Leading inset accounts for macOS traffic lights (existing 90px).
- **Codex verifies:** environment identification modes `artwork | pill | none` are all unchanged.

### 2.2 Sidebar search: Existing, with a palette hint added

- Keep the thread-title filter (existing combobox). Append a trailing `Kbd` showing the resolved `commandPalette.toggle` label. Clicking the hint opens the palette.
- **Codex verifies:** the hint text comes from `shortcutLabelForCommand` (never hard-coded `⌘K`).

### 2.3 Active project section: Extend the project scope list in `Sidebar.tsx`

- **Anatomy:**
  - project row: favicon 16px, name, chevron;
  - when it is the active scope, an indented sub-list:
    - Home,
    - Workbench,
    - Tasks,
    - Notes (only when available),
    - Settings.
- **Sizing:** rows 32px; sub-rows 28px with a 28px indent.
- **Selected row:** `sidebarRowSelected` plus a 2px leading `primary` bar.
- **Props:** `project`, `isActive`, `availableDestinations`, `currentRoute`.
- **States:** default, hover, active-scope, current-route, attention count (badge, e.g. "2" approvals waiting).
- **Accessibility:**
  - `aria-current="page"` on the current sub-row;
  - the sub-list is a `group` labelled by the project name;
  - existing per-project buttons' keyboard reachability is preserved.
- **Codex verifies:** `thread.jump.*` hints still render; the inbox below is unaffected.

### 2.4 `ProviderReadinessSummary`: Proposed

- **Purpose:** a truthful, compact provider status in the sidebar. It replaces the mockup's "Integrations" list and is the main entry to [Provider Connections](SCREEN_BLUEPRINTS.md#2-provider-connections).
- **Reuses:** `ProviderInstanceIcon` (with status dot), `deriveProviderConnectionStatus` ([states §1.6](INTERACTION_STATES.md#16-composite-connection-status-proposed-e3)). `SidebarProviderUpdatePill` stays separate.
- **Anatomy:**
  - Collapsed row: up to 4 overlapping provider marks (20px, −6px overlap, each with a 6px StatusDot) · summary text · chevron.
  - Expanded (hover, focus or click on the chevron): one 28px row per **enabled** instance, showing mark · display name · status label (`type-meta`) · icon.
- **Sizing:** collapsed 36px tall. The expanded popover anchors upward (`side="top"`) and does not push layout.
- **Props:** `connections` (derived statuses for the current environment), `onOpenConnections`, `environmentLabel`.
- **Summary text** (first match wins):
  - Disconnected: "{host} disconnected", `WifiOff`.
  - Any `signing-in`: "Signing in · {Provider}", `info`. No URL, code or countdown.
  - Any `attention`: "{n} need attention", `warning` (or `error` when an instance is blocked).
  - Any `ready`: "{n} ready", `success`, plus "· {k} not verified" muted when some are stale.
  - Only `unverified`: "Not verified · check", muted. Never warning tone.
  - No enabled instance: "No providers enabled", with a "Connect" link.
- **Accessibility:** a button whose `aria-label` repeats the full summary; the popover list is navigable with arrow keys.
- **Codex verifies:**
  - disabled instances never appear as ready and are not counted;
  - stale instances are never counted as needing attention;
  - multiple environments show the current environment only, with its label.

### 2.5 Top toolbar breadcrumb: Extend `WorkspaceBreadcrumb` / `ChatHeader`

- **Adds:** an optional leading environment segment (monitor or cloud icon + label). It shows when the environment is remote or when there is more than one environment.
- **Project segment:** a menu (existing `DraftHeroHeadline` project menu pattern).
- **Truncation order:** thread title first, project second, environment never.

### 2.6 `SurfaceToggleGroup`: Extend `PanelLayoutControls`

- **Purpose:** the single place to open or close Terminal, Files, Diff, Preview and Agents for the current thread. It replaces the mockup's mode bar.
- **Anatomy:** `role="toolbar"`, a group of icon+label toggles (label hidden under 1280px; tooltip shows label and shortcut). Agents shows the existing live-agent count badge (`bg-info`).
- **Sizing:** 28px toggles (`Toggle sm`), 2px gap, `--control-radius`.
- **States:** off, on (`aria-pressed`, `accentSurface` + violet icon), disabled-with-reason (e.g. Preview on web: "Desktop app only"), attention (Agents waiting → dot).
- **Data:** reads and writes `rightPanelStore` and the terminal drawer state directly. **No local cache.**
- **Codex verifies:** the toggle state stays in sync when surfaces are opened from `RightPanelTabs`, the palette or shortcuts.

### 2.7 `ConnectProvidersCta`: Proposed

- **Anatomy:**
  - 36px button with `--brand-gradient` and white text;
  - leading icon `PlugZap`;
  - title "Connect providers";
  - sub-line (`type-micro`) listing the providers that need attention ("Cursor, Claude").
- **Visibility:** only while at least one enabled **primary** instance on the current environment is in the `attention` group for a fixable reason (Not installed, Sign-in required, Model not offered, API credential overrides sign-in), and the CTA is not dismissed (per environment, local preference). Never for stale or unverified instances, disabled instances or a disconnected host.
- **Action:** opens the sheet with the triage strip on Needs attention.
- **Accessibility:** contrast verified on both gradient ends (white on `primary` ≥4.84:1; on `info` the label must sit over the violet half or use a ≥4.5:1 overlay; Codex measures the final rendering).

## 3. Provider Connections components

**Status:** Proposed for E3 (D0.2). They replace D0's `ReadinessLadder`, `ProviderConnectionRow`, `SignInHandoff` and the 560px sheet spec, which assumed no login RPC and a five-level fact model. New files live in `apps/web/src/components/providerConnections/` unless noted. Screens: [SCREEN_BLUEPRINTS.md §2](SCREEN_BLUEPRINTS.md#2-provider-connections). States and copy: [INTERACTION_STATES.md §1](INTERACTION_STATES.md#1-provider-readiness-and-authentication).

### 3.0 Container hierarchy and state ownership

```
<AppSidebarLayout>                       existing shell; the current route stays mounted
  … current route …
  <ProviderConnectionsSheet>             mounted once at the shell; open state = URL search params
    <ProviderConnectionsScope>           host menu · access chip · scope banner (disconnected, older host)
    ├─ <ProviderConnectionsOverview>     (list pane; always visible at ≥1920)
    │    <ProviderTriageStrip/>
    │    <ProviderConnectionCard/> × primary instances
    │    <OtherProvidersGroup> <ProviderConnectionCard density="compact"/> × others </OtherProvidersGroup>
    └─ <ProviderConnectionDetail>        (pushed pane; side pane at ≥1920)
         <ProviderStatusPanel> | <ProviderSignInPanel>
              <BrowserHandoffStep/> <DeviceCodeStep><PrivateCodeDisplay/></DeviceCodeStep>
              <GuidedTerminalSteps/> <SignInOutcome/> <AttemptCountdown/>
         <ProviderRecoveryNotice/>
         <ProviderFactList/>  <ProviderBillingSection/>  <ProviderDiagnostics/>
```

| State                                                        | Owner                                                                                                            | Lifetime                                            | Persisted?                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| Provider snapshots                                           | Existing environment provider state (snapshot subscription)                                                      | Existing                                            | Existing behavior (cache is never "fresh") |
| E1 readiness                                                 | Derived per render by `deriveProviderReadiness`; one 15s `now` ticker per sheet                                  | Render                                              | No                                         |
| Session scopes, connection phase and generation              | Existing `useEnvironmentSessionState`, `useEnvironmentConnectionState`                                           | Existing                                            | No                                         |
| Sheet open, view, host                                       | URL search params (`connections`, `connectionsEnv`)                                                              | Navigation                                          | Browser history only; never ceremony data  |
| Lifecycle mirror (state, `attemptId`, `expiresAt`, ceremony) | `providerConnectionAttempts` volatile atom family, keyed by `[environmentId, instanceId, connection generation]` | Until terminal state, expiry, or a reset-key change | **No**                                     |
| Ceremony `handoff` (URL, user code)                          | Local state of the mounted `ProviderSignInPanel` only                                                            | While mounted and the attempt is active             | **Never**                                  |
| Code revealed, triage filter, Diagnostics open               | Local component state                                                                                            | While mounted                                       | No                                         |
| Launch origin (element, route)                               | Sheet controller ref                                                                                             | One opening                                         | No                                         |

No component here owns execution state, writes provider configuration, or starts processes other than through `server.refreshProviders`, `server.providerAuthentication` and the existing update/enable paths.

### 3.1 Pure modules (Proposed)

- **`providerConnectionStatus.ts`:** `deriveProviderConnectionStatus({ readiness, lifecycle, connection, scopes, enabled, capabilityAvailable })` returns `{ group, label, tone, icon, primaryAction, subline }` per [states §1.6](INTERACTION_STATES.md#16-composite-connection-status-proposed-e3). Table-driven tests cover every fixture in [states §1.8](INTERACTION_STATES.md#18-synthetic-fixtures) and every E2 `state` × `reason`.
- **`providerReadinessCopy.ts`:** the fact copy ([states §1.1](INTERACTION_STATES.md#11-e1-readiness-facts-delivered)), billing copy ([§1.2](INTERACTION_STATES.md#12-reported-billing-route-delivered-e1)), lifecycle copy ([§1.3](INTERACTION_STATES.md#13-e2-authentication-lifecycle-delivered)) and recovery copy ([§1.5](INTERACTION_STATES.md#15-recovery-states)). The existing `ProviderReadinessDetails` and `ProviderAuthenticationControls` move to it, so Settings and Connections never disagree.
- **`providerConnectionsSearch.ts`:** the search-param schema. Accepts `all` or a `ProviderInstanceId`, and an `EnvironmentId`. Rejects everything else.
- **`providerSignInCopy.ts`:** per-driver ceremony copy (Codex, Cursor, Claude, generic) and the override variable names. No commands are built from configuration values.

### 3.2 `useProviderAuthenticationAttempt`: Proposed (extracted)

- **Why:** the delivered `ProviderAuthenticationControls` already implements the hard parts: the `access:write` gate, reset keys over connection generation and phase, a generation guard against late replies, `inFlight` re-entry protection, client expiry and 1s status polling. E3 extracts them into one hook so the Settings control and the sheet share one implementation.
- **Returns:** `{ status, phase: "idle" | "preparing" | "active" | "outcome", canManage, begin(ceremony), cancel(), refresh(), readStatus() }`. `status.handoff` is returned only to the mounted panel and is never copied into the attempts atom.
- **Polling:** `status` every 1s while an attempt is visible and the document is visible; every 5s while the sheet is closed (feeding the sidebar summary); stops on a terminal state, expiry, disconnect or reset.
- **Reset keys:** `[environmentId, instanceId, connection generation, connection phase, canManage]`. A change drops the mirror and the handoff and re-reads `status`.
- **Errors:** a transport failure clears ceremony data and sets "Status unavailable". It never surfaces an RPC cause.
- **Codex verifies:** the existing `ProviderAuthenticationControls.test.tsx` scenarios still pass after the extraction; new tests cover the 5s background poll, the attempts atom never containing `handoff`, and reopening during an attempt.

### 3.3 `ProviderConnectionsSheet`: Proposed

- **Reuses:** `ui/sheet` (`side="right"`), `ui/scroll-area`, `ui/button`.
- **Sizing:** 600px (`--connections-sheet-width`) at 768–1919px, capped at `calc(100vw - 48px)`; 1000px two-pane (`--connections-sheet-width-wide`) at ≥1920px; full screen under 768px. `radius-xl` on the leading edge, `surfaceOverlay`, `--scrim` backdrop. Existing `max-w-md` is overridden through a variant, not a fork.
- **Props:** none. It reads search params, environments and access through hooks.
- **Behavior:** on open, runs the verify-on-open policy ([blueprint §2.8](SCREEN_BLUEPRINTS.md#28-primary-interactions)); records the launch origin; restores focus on close. Closing never cancels an attempt.
- **Accessibility:** `role="dialog"`, `aria-modal="true"`, labelled by the title; focus trap; Esc closes.
- **Codex verifies:** no route navigation or remount underneath; back-button behavior; one data source shared with `ProviderSettingsPanel` (no second fetch loop).

### 3.4 `ProviderConnectionsScope`: Proposed

- **Anatomy:** "Execution host" label · menu button (`ConnectionStatusDot`, monitor or cloud icon, environment label) · access chip ("Manage access" or "Read-only", `Lock`) · scope banner slot.
- **Data:** the environment registry and session scopes. The menu lists every environment, including disconnected ones.
- **States:** connected, connecting (spinner), disconnected (scope banner with Reconnect), older host (banner without sign-in).

### 3.5 `ProviderTriageStrip`: Proposed

- **Reuses:** `ui/toggle-group`, single select.
- **Anatomy:** All · Ready · Needs attention · Not verified. Each item has its icon, label and tabular count.
- **Rule:** it filters, never sorts. Disabled instances are excluded from counts. Counts come from `deriveProviderConnectionStatus`.
- **Accessibility:** one Tab stop, arrow keys, `aria-pressed`. Each item's accessible name includes its count ("Needs attention, 1").

### 3.6 `ProviderConnectionCard`: Proposed (composes `ProviderInstanceIcon`, `RedactedSensitiveText`)

- **Anatomy:** see [blueprint §2.2](SCREEN_BLUEPRINTS.md#22-overview-screen-a). Header (identity, sub-line, status, primary action), fact grid, advisory chips. A 2px leading rule appears for `attention` and `signing-in`.
- **Density:** `default` (164px, fact grid 3 × 2), `narrow` (fact grid 2 × 3, full-width action), `compact` (40px row: mark, name, status, action, chevron; used for other providers and the ≥1920 list pane).
- **Props:** `connection` (the derived status plus readiness, billing and identity), `selected?`, `onOpenDetail`, `onPrimaryAction`, `density`.
- **States:** default, hover (`surfaceRaised`), focus-visible (ring on the focused control), checking (spinner, `aria-busy`, values muted), selected (≥1920 only), skeleton.
- **Accessibility:** `article` labelled by the provider name. The header is one button ("Codex details, Ready"). The primary action is a separate button with a full accessible name ("Sign in to Cursor on This Mac").
- **Must not:** show ceremony data, show the plan label, or use solid violet.

### 3.7 `ProviderFactGrid` / `ProviderFactList`: Proposed

- **Grid** (cards): six cells (Sign-in, Account, Billing · reported, Model, Runtime, Last check). **List** (detail): the seven E1 facts as a `dl`.
- **Cell:** label (`type-meta`, `textMuted`) over value (`type-body-compact`) with a 14px icon. Unknown values are muted and dashed-icon, never blank.
- **Props:** `readiness`, `billingRoute`, `verifiedAt`, `fresh`, `modelLabel`, `accountEmail`, `layout`.
- **Codex verifies:** copy comes only from `providerReadinessCopy.ts`; no raw snapshot fields are read.

### 3.8 `ProviderConnectionDetail`: Proposed

- **Sections:** identity header, status panel or sign-in panel, account and sign-in, readiness (`ProviderFactList`), billing, diagnostics (`ui/collapsible`, closed), Provider Settings link ([blueprint §2.3](SCREEN_BLUEPRINTS.md#23-provider-detail-screen-b)).
- **Props:** `environmentId`, `instanceId`.
- **Data:** readiness from the snapshot; lifecycle from `useProviderAuthenticationAttempt`; the executable path and `CLAUDE_CONFIG_DIR` from the existing instance configuration (display only).
- **Accessibility:** focus to the heading on push; back restores focus to the card.

### 3.9 `ProviderSignInPanel` and ceremony steps: Proposed

- **Dispatch:** by E2 `capability` and the chosen ceremony: `BrowserHandoffStep` (Codex browser, Cursor), `DeviceCodeStep` (Codex device code), `GuidedTerminalSteps` (Claude), `SignInOutcome` (`authenticated`, `cancelled`, `failed`, `expired`), `ProviderRecoveryNotice` (everything else).
- **Anatomy:** header (title, `AttemptCountdown`), numbered steps (`ol`), status line (`role="status"`), footer (Cancel or Stop tracking).
- **Browser handoff:** "Open {Provider} sign-in" (`messageAction`, `ExternalLink` icon) with the parsed host name beside it. Opens only on click, through the desktop external-open bridge or `window.open` with `noopener,noreferrer`.
- **Guided terminal:** the executable and `CLAUDE_CONFIG_DIR` rows (mono, start-truncated, Copy each) and fixed `auth login` text. **No** "Open terminal in Nebula" and no composed shell line.
- **Must not:** render the full URL, keep `handoff` after a terminal state, auto-open a browser, or place ceremony data anywhere listed in [states §1.7](INTERACTION_STATES.md#17-ceremony-data-handling).
- **Codex verifies:** begin, cancel and refresh carry the exact `environmentId`, `instanceId` and current `attemptId`; a response whose identity differs is discarded.

### 3.10 `PrivateCodeDisplay`: Proposed

- **Anatomy:** a 48px code block (`codeBackground`, `type-mono-display`) showing `••••-••••` until revealed · "Show code"/"Hide code" toggle (`Eye`/`EyeOff`, `aria-pressed`) · Copy · the warning line.
- **Behavior:** reveal lasts while the attempt is active. Copy confirms "Copied. Paste it only at {host name}." for 2s. Expiry or a terminal state clears the value and returns to masked.
- **Accessibility:** once revealed, the accessible name spells the code in groups. The masked state reads "Device code hidden".

### 3.11 `AttemptCountdown`: Proposed

- **Anatomy:** `Timer` icon + "Expires in m:ss" (`type-meta`, tabular numerals). Under 60s, `warning` tone.
- **Accessibility:** `role="timer"`, `aria-live="off"`. A separate polite announcement fires once at 60s and once at expiry.
- **Source:** server `expiresAt`. A local timer moves to the expired presentation without waiting for a poll.

### 3.12 `ProviderRecoveryNotice`: Proposed

- **Reuses:** `ui/alert`.
- **Props:** `kind` (one of [states §1.5](INTERACTION_STATES.md#15-recovery-states)), `provider`, `host`, `onPrimary`, `onSecondary?`, `guidance?`.
- **Rule:** icon + title + at most two sentences + primary + at most one secondary button, plus an optional inline link to Provider Settings. Permission uses `Lock` with neutral tone. Shows E2 `guidance` verbatim only for the Unsupported configuration kind.

### 3.13 `ProviderStatusBanner`: Extend

- **Adds:** one action matching the instance's primary action ("Sign in", "Check again", "Update"). It opens the sheet at that instance. Dismiss stays.
- **Copy change:** replace "Sign in via the CLI to authenticate again." with the provider-specific recovery title. The banner never shows ceremony data.
- **Tone:** `warningSurface` / `errorSurface` with a leading rule.

### 3.14 Model picker readiness: Extend `ModelPickerSidebar`, `ModelPickerContent`

- **Adds:** a status dot and label per instance from `deriveProviderConnectionStatus`; an "API billing" chip for `billingRoute === "api"`; "Manage connections" at the foot, opening the sheet at the highlighted instance.
- **Rule:** an instance that is not Ready stays visible with its reason (existing `disabledReason`). Stale instances are selectable and labelled "Not verified".

### 3.15 Existing settings components: Extend lightly

| Component                           | Change                                                                                     | Why                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| `ProviderReadinessDetails`          | Consume `providerReadinessCopy.ts`. Same layout                                            | One copy source                        |
| `ProviderAuthenticationControls`    | Consume `useProviderAuthenticationAttempt`. Same behavior; adds "Open in connections" link | One lifecycle implementation           |
| `ProviderInstanceCard` (829 lines)  | **No growth.** Only the prop wiring needed for the two changes above                       | Avoid expanding an oversized component |
| `ProviderSettingsPanel` (910 lines) | Accept the proposed `instance` search param to expand one card. No other change            | Deep link from the sheet               |

## 4. Execution context

### 4.1 `ExecutionContextChip`: Proposed

- **Anatomy:**
  - optional env icon/label (remote);
  - `GitBranch` 14px + branch (mono, `type-mono`);
  - `·`;
  - worktree label ("Current checkout" or worktree name);
  - optional `·` + "Task: {title}";
  - optional dirty `●n`;
  - chevron.
- **Sizing:** 28px tall, max 420px; inner segments truncate (branch from the end, worktree from the start); `secondary` surface; `--control-radius`.
- **Props:** `context` (server-resolved: environment, project, branch, head, worktree, task, dirty, mismatch, remote, connection), `onOpen`.
- **States:** see [states §2](INTERACTION_STATES.md#2-execution-context-states).
- **Accessibility:** a button whose `aria-label` reads the full context sentence; `aria-haspopup="dialog"`.
- **Codex verifies:** it renders a fixed-width skeleton while loading; it never shows a client-selected path before server resolution.

### 4.2 `ContextPopover`: Proposed

- **Anatomy:** a definition list of the seven facts ([contract §5.1](SUPER_ADE_DESIGN_CONTRACT.md#51-the-seven-facts)) plus HEAD SHA, ahead/behind and changed/untracked counts. It ends with these actions:
  - "Open Diff",
  - "Open Branches",
  - "Copy context",
  - "Start a new thread here",
  - for a Task: "Open Task".
- **Sizing:** 360px wide, `radius-xl`, `surfaceOverlay`.
- **Must not:** contain a direct "switch branch" mutation. Switching goes through the Branches view guard.

### 4.3 `PaneIdentityHeader`: Proposed (shared)

- **Purpose:** one header used by right-panel terminal surfaces and Terminal Center panes, so identity labeling is consistent ([states §3](INTERACTION_STATES.md#3-session-and-surface-identity)).
- **Anatomy:**
  - 28px;
  - icon + title (`type-label`);
  - sub-label (`type-meta`, muted): environment · worktree, or "Separate session, not linked to this chat";
  - trailing pane actions (existing).
- **Codex verifies:** it replaces only the label region in `ProjectTerminalWorkspace`; pane actions and drag handles are untouched.

### 4.4 Composer context strip: Existing `BranchToolbar`

- Keep the existing Environment ("Run on"), Workspace and Branch selectors. Restyle as 24px ghost chips with `type-meta`.
- In the locked state they render as text with a `Lock` icon and the tooltip "Context is fixed for this thread."

## 5. Project Home

### 5.1 `ProjectHeader`: Proposed

- **Anatomy:**
  - Row 1: 40px project mark tile (favicon on `surfaceRaised`, `radius-lg`) · project name (`type-title-lg`) · description/path line (`type-meta`, start-truncated path) · trailing actions (Open in…, existing `OpenInPicker`; overflow menu with Settings).
  - Row 2: `ui/tabs` underline ([contract §4.4](SUPER_ADE_DESIGN_CONTRACT.md#44-project-level-navigation)).
- **Removed from the mockup:** Star/count.

### 5.2 `ResumeList`: Extend the Launchpad "Continue" grid

- **Rows (44px):**
  - thread status pill (existing `ThreadStatusIndicators`);
  - title;
  - context (branch · worktree, mono meta);
  - provider mark;
  - relative time.

  Up to 6 rows, then "Show all in sidebar".

- **Data:** existing recent threads plus the active mission. No new persistence.

### 5.3 `AttentionList`: Proposed

- **Purpose:** one place for "needs you":
  - pending approvals,
  - awaiting input,
  - plan ready,
  - review rejected,
  - integration conflict,
  - provider not ready.
- **Rows:** icon (tone) · what · where (thread/Task) · action button ("Review", "Answer", "Open").
- **Empty state:** "Nothing needs you" (single line, no illustration).
- **Data:** derived from existing thread pills, Task review state and Mission run state.

### 5.4 `ToolTile` / `ToolTileGrid`: Extend `RightPanelEmptyState`

- **Anatomy (tile):**
  - 18px icon in a 32px `accentSurface` square;
  - title (`type-label`);
  - one-line description (`type-meta`);
  - top-right `Kbd` letter (existing B/T/F/D/P/A shortcuts).
- **Tiles:**
  - Browser,
  - Terminal,
  - Files,
  - Diff,
  - Pull Request,
  - Agents,
  - Notes (proposed, when available).
- **Sizing:** min 148px, 72px tall; grid `auto-fill`; 8px gap; `radius-lg`.
- **States:**
  - hover: border → `input`;
  - focus: ring;
  - disabled with reason (e.g. "Pull requests need a GitHub remote");
  - selected (surface already open): `accentSurface` border.
- **Reuse:** the **same component** renders in the context panel empty state and in the Project Home right column.
- **Codex verifies:** letter shortcuts stay scoped to grid focus (existing capture-phase behavior).

### 5.5 `RunningServicesList`: Proposed

- **Rows:** `StatusDot` live · service name · `localhost:port` (+ "on {env}") · origin badge ("Started by Nebula" / "Discovered") · actions "Open preview", "Open terminal".
- **Data:** existing dev-server discovery (`devServerDiscovery.ts`, `useDiscoveredLocalServers`). Closing a preview never stops a server.

### 5.6 `EmptyProjectHero`: Extend `DraftHeroHeadline`

- **Shown only when** the project has no threads.
- **Anatomy:**
  - 40px mark;
  - `type-display` headline ("What should we build in {project}?", which keeps the existing copy and project picker);
  - one-line subtitle;
  - static radial glow behind it (`--primary` 18%, `--info` 10%, CSS only);
  - starter chips (Create a feature · Fix a bug · Refactor · Write tests). The chips prefill the composer draft text **only**; they do not set intent or execute.

## 6. Composer

### 6.1 `IntentControl`: Proposed

- **Anatomy:**
  - segmented `ToggleGroup` (`segmented` size), 28px, in the composer footer, left of the model picker;
  - items: Chat · Analyze · Task · Mission plan;
  - the compact footer moves it into `CompactComposerControlsMenu` as an "Intent" section.
- **Props:** `value`, `availability: Record<Intent, {enabled, reason?}>`, `onChange`.
- **States:** see [states §5.1](INTERACTION_STATES.md#51-intent-availability). Selection changes the primary button label and icon.
- **Accessibility:** `radiogroup` semantics; disabled options are focusable and their reason is exposed via `aria-describedby`.
- **Codex verifies:** this is extracted as its own file (not grown inside `ChatComposer.tsx`); intent persists per draft; Chat sends through the existing path unchanged.

### 6.2 `ComposerAttachMenu`: Proposed

- **Anatomy:** a 28px ghost "+" button at the footer start opening a `Menu`:
  - Image… (file picker → existing image attachment path);
  - File reference… (opens `ProjectFilePicker` → existing `@path` mention);
  - Note revision… (when Notes exist);
  - Terminal output (only when a terminal has a selection → existing terminal context chip);
  - Preview element (desktop only → existing element context).
- **Rule:** every item maps to an existing context type. The menu adds discoverability, not new context kinds.

### 6.3 Context chips: Existing `ComposerPending*` components

Restyle to one chip system:

- 24px;
- `secondary` surface;
- type icon;
- label;
- remove ×;
- provenance tooltip (e.g. "Note: Architecture decisions · rev 7").

### 6.4 Composer shell: Existing `.chat-composer-glass-shell`

- Keep the 22px radius and glass.
- Add `--glow-focus` on `:focus-within`.
- Placeholder copy: "Ask Nebula to build, fix, or explore anything in this project…" when Intent is Chat. It changes per intent ("Describe the Task outcome and acceptance criteria…", "Describe the Mission goal…").

## 7. Agents

### 7.1 `AgentsOverview`: Proposed (Project Home strip + full view)

- **Groups, in order:**
  1. **Active sessions:** live; from canonical threads and Tasks with running/waiting status.
  2. **Saved roles:** templates; **data proposed**, hidden until role settings exist.
  3. **Provider connections:** readiness rows (reuses §3.2 in compact form).
  4. **External collaborators:** **data proposed**, hidden until references exist.
- **Strip variant (Home):**
  - horizontal list of up to 5 `AgentSessionCard`s;
  - then "Manage" (opens the full view);
  - empty state: "No agents running", with "Start a thread" and "Run a Swarm" links.
- **Codex verifies:** native provider subagents stay in the existing `AgentsPanel` surface and are not duplicated as top-level sessions.

### 7.2 `AgentSessionCard`: Proposed

- **Anatomy:**
  - 32px provider mark (with a live `StatusDot` only for running/waiting);
  - title (thread or Task);
  - role chip (if any);
  - context line (worktree · model);
  - status text from the existing pill vocabulary ("Working", "Pending Approval", "Awaiting Input", "Plan Ready", "Completed").
- **Sizing:** 152×56px, `radius-lg`.

### 7.3 `RoleTemplateCard`: Proposed (data proposed)

- **Anatomy:**
  - 32px role glyph on `accentSurface` (no provider mark, **no status dot**);
  - role name;
  - "Template · {provider} {model}";
  - "Use" button (prefills a Task or thread; does not run).

### 7.4 `ExternalCollaboratorRow`: Proposed (data proposed)

- **Anatomy:**
  - `ExternalLink` glyph;
  - user-supplied name;
  - "External · status unknown";
  - actions "Open", "Prepare handoff", "Import result".
- **Never shows a live status.**

### 7.5 `AgentsPanel`: Existing

Restyle only, through tokens:

- status dots route to `info`, `success`, `error` and muted;
- the footer summary is unchanged.

## 8. Notes (all Proposed; require audit Phase 4 backend)

### 8.1 `NotesList`

- **Rows (52px):**
  - category dot (Decision = violet, Architecture = ion, Research = success, Idea = warning, General = muted; **paired with the category text**);
  - title;
  - first line excerpt;
  - updated relative time;
  - pin icon.
- **Header:** search, "New note", filter by category/pinned.

### 8.2 `NoteEditor`

- **Layout:** title input (`type-title-lg`, borderless) · meta row (scope, category, agent policy, revision, save state) · Markdown editor with a preview toggle.
- **Reuse:** reuse the file editor's Markdown rendering where possible (`FilePreviewPanel` markdown mode, `ChatMarkdown`).
- **Save states:** [states §6](INTERACTION_STATES.md#6-save-states-notes-file-editor).

### 8.3 `NoteRevisionDrawer`

A right-side list of revisions:

- revision n;
- author (human or "Proposed by {agent}");
- time;
- diff view;
- "Restore as new revision".

### 8.4 `NoteAttachChip`

A composer chip reading "{title} · rev n". It pins the revision. A tooltip warns when a newer revision exists ("rev 9 available").

### 8.5 `NoteAgentPolicySelect`

Private · Attachable · Project context · Protected, each with a one-line explanation. The default follows founder decision F10.

## 9. Branches and worktrees (Proposed; presentation over existing VCS contracts)

### 9.1 `BranchInventoryTable`

- **Columns:**
  - branch (mono);
  - worktree (label or "—");
  - Task/Mission;
  - status (dirty ●n, ahead ↑n, behind ↓n);
  - last commit (relative, with an explicit "commit" label);
  - PR (existing PR association);
  - activity (sessions or services running).
- **Toolbar:**
  - search refs (existing paginated ref search);
  - filters (Mine, Has worktree, Stale ≥30d; "stale" never implies deletable);
  - "New branch…".
- **Row actions:**
  - **Inspect** (detail sheet);
  - **Open workspace** (opens an existing worktree, or creates a new one through the existing worktree flow);
  - **Switch checkout** (guarded, [states §4](INTERACTION_STATES.md#4-context-switching)).
- **Responsive:** table at ≥1024px; summary rows plus a detail sheet below.

### 9.2 `WorktreeDetailSheet`

Path, branch, HEAD, Task link, sessions, services, changed/untracked counts, review/integration state, and actions:

- Open,
- Open Diff,
- Retain/Archive,
- Remove…, which is only enabled after a fresh safety assessment and is a separate confirm dialog listing what would be lost.

### 9.3 `SwitchGuardDialog`

Implements the [switching sequence](INTERACTION_STATES.md#4-context-switching).

- Lists blockers, each with a link.
- The primary action is "Open {branch} in a new worktree".
- There is no "Switch anyway".

## 10. Swarm entry

### 10.1 Swarm destination: Extend `SidebarSwarmModeButton`

- Keep the existing status text ("3 active · Checkpoint 2", Planning, Ready, Brief).
- **Restyle:**
  - 44px two-line row: "Swarm" + status (`type-meta`);
  - leading `Network` icon in an `accentSurface` square;
  - attention badge when a Mission needs approval or checkpoint review.

### 10.2 `MissionStageNav`: Extend the existing "Swarm workflow" nav in `SwarmWorkspace`

- Stages: Swarm Brief → Team Plan → War Room → Review & Integration (existing).
- Render it as a horizontal stepper (`ui/tabs` underline variant, with the stage index).
- Completed stages show a check. The current stage gets a violet indicator. Gated stages show a lock plus a reason ("Approve the plan to continue"). Approval and Run authorization remain separate explicit actions inside the stages.
