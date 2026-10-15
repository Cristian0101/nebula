# Super ADE component specifications

**Status:** Proposed.

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

- **Why:** Tabs are hand-rolled today (`role="tablist"` in Command Deck and Button groups elsewhere). Project header tabs, Notes and the Connections sheet need one accessible primitive.
- **Reuses:** Base UI tabs (the same library family as the existing `ui/*` primitives). Visual style follows `Toggle` `segmented` for pill tabs and an underline variant for page tabs.
- **Variants:**
  - `underline`: page-level. 36px tall, `type-label`, 2px `primary` indicator that slides with `--motion-base`.
  - `pill`: in-panel. 28px, `accentSurface` selected.
- **Props:** `value`, `onValueChange`, `items[{value, label, icon?, count?, disabled?, disabledReason?}]`, `variant`, `activationMode: "automatic" | "manual"`.
- **Accessibility:** `tablist`/`tab`/`tabpanel` roles, arrow keys, Home/End. A disabled tab stays focusable when it has a `disabledReason` tooltip.
- **Codex verifies:** the indicator respects reduced motion; existing hand-rolled tablists can migrate later (not required).

### 1.2 `ui/badge` → StatusBadge: Extend

- **Reuses:** existing variants `success | warning | error | info | secondary | outline`.
- **Adds:** a `level` prop (`met | attention | blocked | unknown | n/a`) that picks the variant **and** the leading icon from [states §1.1](INTERACTION_STATES.md#11-facts-not-a-single-status). Text is mandatory.
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

- **Purpose:** a truthful, compact provider status in the sidebar. It replaces the mockup's "Integrations" list.
- **Reuses:** `ProviderInstanceIcon` (with status dot), readiness derivation ([states §1](INTERACTION_STATES.md#1-provider-readiness)), `SidebarProviderUpdatePill` stays separate.
- **Anatomy:**
  - Collapsed row: up to 4 overlapping provider marks (20px, −6px overlap, each with a 6px StatusDot) · summary text "2 ready · 1 needs attention" · chevron.
  - Expanded (hover/focus/click): one 28px row per **enabled** instance, showing mark · display name · headline (`type-meta`) · level icon.
- **Sizing:** collapsed 36px tall. The expanded popover anchors upward (`side="top"`) and does not push layout.
- **Props:** `providers` (derived readiness list), `onOpenConnections`, `environmentLabel`.
- **States:**
  - All ready: "{n} providers ready", success icon.
  - Any attention: "{n} need attention", warning.
  - Any blocked: "Sign in required" or the first blocker, error.
  - Checking: spinner.
  - No providers enabled: "No providers enabled", with a "Connect" link.
- **Accessibility:** a button with `aria-label` that repeats the full summary; the popover list is navigable with arrow keys.
- **Codex verifies:**
  - disabled instances never appear as "ready";
  - Antigravity/OpenCode disabled are excluded from counts;
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
  - sub-line (`type-micro`) listing the non-ready providers ("Cursor, Grok").
- **Visibility:** only while ≥1 enabled provider is not Ready on the current environment and it is not dismissed (per-environment, local preference).
- **Accessibility:** contrast verified on both gradient ends (white on `primary` ≥4.84:1; on `info` the label must sit over the violet half or use a ≥4.5:1 overlay; Codex measures the final rendering).

## 3. Provider components

### 3.1 `ReadinessLadder`: Proposed

- **Purpose:** show the seven facts compactly.
- **Variants:**
  - `inline`: one line of 7 icons with labels hidden and tooltips. Used in the model picker sidebar.
  - `stacked`: vertical list, icon · fact · value · action. Used in provider detail.
- **Props:** `facts: Array<{id, level, value, detail?, action?}>`, `variant`.
- **Accessibility:** the `stacked` variant is a definition list (`dl`); `inline` exposes an `aria-label` sentence ("Codex: installed, update available, signed in, …").
- **Codex verifies:** facts come only from the pure derivation function; there is a snapshot test per fixture in [states §1.5](INTERACTION_STATES.md#15-observed-states-from-the-running-client-accounts-redacted).

### 3.2 `ProviderConnectionRow`: Proposed (composes `ProviderInstanceIcon`)

- **Anatomy:**
  - 32px provider mark;
  - name + badge ("Early Access", existing);
  - instance label when there are multiple instances;
  - headline (`type-body-compact`) + sub-line (account · route, `type-meta`; email via existing `RedactedSensitiveText`);
  - trailing primary action button (from [states §1.4](INTERACTION_STATES.md#14-overall-row-summary));
  - chevron to detail.
- **Sizing:** 64px row, 16px horizontal padding, `radius-lg` card in the list.
- **States:** the summary states from [states §1.4](INTERACTION_STATES.md#14-overall-row-summary), plus checking (row-level spinner and `aria-busy`).

### 3.3 `ProviderConnectionsSheet`: Proposed

- **Container:**
  - `ui/sheet` from the right on desktop: 560px wide; `radius-xl` on the leading edge; `surfaceOverlay`.
  - Full-screen on `compact`.
  - Focus returns to the launcher.
- **Sections:**
  1. Environment header (which environment you are configuring, with a switcher if there are several environments).
  2. "Ready", "Needs attention" and "Disabled" groups of `ProviderConnectionRow`.
  3. "Add a provider" (existing `AddProviderInstanceDialog`).
  4. Footer: "Checked {relative}" + "Check all" (`server.refreshProviders`) + "Advanced settings" (link to `/settings/providers`).
- **Detail view:** pushes inside the sheet. A back button sits at the top-left. The step change uses `--motion-sheet`.
- **Codex verifies:** this is a presentation layer over the same data as `ProviderSettingsPanel`; there is no duplicate fetch loop; the "Limited permissions" read-only state carries over.

### 3.4 `SignInHandoff`: Proposed

- **Anatomy:**
  - "How sign-in works for {Provider}" paragraph;
  - command block (mono, `codeBackground`, Copy button);
  - "Open terminal in {env}" (secondary);
  - "I've signed in. Check again" (primary).
- **Future slot:** a `begin/status/cancel` stepper replaces the command block when the typed auth lifecycle exists.
- **Accessibility:** the polite live region announces the check result; Copy confirms with "Copied" for 1.5s.
- **Must not:** auto-run commands, display tokens/device codes in logs, or open external URLs taken from server prose without a safe-URL check.

### 3.5 `ProviderStatusBanner`: Extend

- **Adds:** an action button matching the row's primary action ("Sign in…" opens the sheet at the provider detail; "Update"; "Check again"), keeping dismiss.
- **Tone:** `warningSurface`/`errorSurface` with leading rule.

### 3.6 Model picker readiness: Extend `ModelPickerSidebar`, `ModelPickerContent`

- **Adds:**
  - an inline `ReadinessLadder` (icons only) under each instance in the picker sidebar;
  - a billing route chip on API/cloud instances ("API billing");
  - on custom models, the existing `isCustom` → "Unverified" chip.
- **Rule:** an instance that is not Ready remains visible with its reason (existing `disabledReason` behavior).

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
