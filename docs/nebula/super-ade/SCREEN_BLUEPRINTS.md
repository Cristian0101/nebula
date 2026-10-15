# Super ADE screen blueprints

**Status:** Proposed. One blueprint per core experience. Each has these parts:

- desktop layout,
- information hierarchy,
- component inventory (with status labels from [COMPONENT_SPECIFICATIONS.md](COMPONENT_SPECIFICATIONS.md)),
- primary interactions,
- states,
- keyboard and focus,
- responsive behavior,
- motion,
- visual acceptance criteria.

Layouts are drawn at the **desktop** breakpoint (1440×900) unless noted. Measurements are in CSS px.

## 1. Project Home / Overview

**Route:** `/projects/$projectKey` (existing, `ProjectLaunchpad`). **Purpose:** resume real work quickly and see what needs you.

### 1.1 Desktop layout (active project)

```
┌ Sidebar 256 ┬───────────────────────── Main (canvas) ─────────────────────────┬─ Context 360 ──────┐
│             │ Toolbar 52: [env ▸] Project ▾ ▸ Home   [⎇ main · Current checkout ●2]  [⊞ toggles]│
│             ├────────────────────────────────────────────────────────────────┤ Open a surface      │
│             │ ProjectHeader                                                  │ ┌Browser B┐┌Term T┐ │
│             │ [■] Nebula OSP                         [Open in ▾] [⋯]         │ ├Files F──┤├Diff D┤ │
│             │     ~/Code/nebula-osp                                          │ ├PR P─────┤├Agnt A┤ │
│             │ Overview  Tasks  Files  Branches  Notes  Settings              │ └Notes N──┘         │
│             │ ───────────────────────────────────────────────────────────────│                     │
│             │ ┌ Needs you (AttentionList) ───────┐ ┌ Resume (ResumeList) ───┐│ Project notes  [+]  │
│             │ │ ⚠ Approval · Add notes API  [Review]│ ● Working  Fix sidebar…  ││ ● Product direction │
│             │ │ ? Awaiting input · Refactor [Answer]│ ✓ Done     Tokens pass   ││ ● Release checklist │
│             │ └─────────────────────────────────┘ └────────────────────────┘│ ● Architecture…     │
│             │ ┌ Running ────────────────────────┐ ┌ Agents (strip) ────────┐│                     │
│             │ │ ● web  localhost:5733  [Preview] │ │ [Codex·Working][Claude…]││                     │
│             │ └─────────────────────────────────┘ └────────────────────────┘│                     │
│             │ ┌ Composer (compact, intent Chat) ─────────────────────────────┐│                     │
│             │ │ Ask Nebula to build, fix, or explore anything…               ││                     │
│             │ │ [+] [Chat|Analyze|Task|Mission plan] [Codex · gpt-5 ▾] [🔒Supervised▾]     [↑]   ││
│             │ └──────────────────────────────────────────────────────────────┘│                     │
└─────────────┴────────────────────────────────────────────────────────────────┴─────────────────────┘
```

**Empty or new project** (no threads): the body is replaced by `EmptyProjectHero`:

- 40px mark,
- "What should we build in {project}?" (`type-display`),
- subtitle,
- static glow,
- four starter chips,
- full-size composer centered at max 768px.

The context column stays.

### 1.2 Information hierarchy

1. Execution context: toolbar chip, then the project header path.
2. Needs you.
3. Resume.
4. Running services.
5. Active agents.
6. New work: composer.
7. Tools: Open a surface.
8. Pinned notes.

This follows the audit's order. The mockup's hero is demoted to the empty state.

### 1.3 Component inventory

| Component                                                           | Status                                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ProjectHeader` + `ui/tabs`                                         | Proposed                                                                                  |
| `ExecutionContextChip`                                              | Proposed                                                                                  |
| `AttentionList`                                                     | Proposed                                                                                  |
| `ResumeList`                                                        | Extend (Launchpad "Continue")                                                             |
| `RunningServicesList`                                               | Proposed (existing discovery data)                                                        |
| `AgentsOverview` strip                                              | Proposed                                                                                  |
| Composer (compact) + `IntentControl`                                | Extend + Proposed                                                                         |
| `ToolTileGrid`                                                      | Extend (`RightPanelEmptyState`)                                                           |
| Notes list (compact)                                                | Proposed (hidden until Notes backend)                                                     |
| `EmptyProjectHero`                                                  | Extend (`DraftHeroHeadline`)                                                              |
| Launchpad mode cards (Terminal Center / Run a Swarm / Quick Thread) | Existing. Move to the empty state as secondary entries, and into the sidebar destinations |

### 1.4 Primary interactions

- Click a Resume row: open the thread.
- Attention action: deep-link to the approval, question or review.
- Running service: Preview opens the preview surface (desktop) or a browser tab (web).
- Send from the composer: creates a thread **in this project** (existing draft flow) with the selected intent.
- Tool tile: opens the surface in the Workbench of the most recent thread. With no thread, it opens a new draft with that surface.

### 1.5 States

| State                           | Treatment                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                         | Skeletons for each card at final size. The header renders immediately from the cached project                                                           |
| No threads                      | `EmptyProjectHero`                                                                                                                                      |
| No provider ready               | Composer disabled with reason. Attention gets "Connect a provider" first. `ConnectProvidersCta` visible                                                 |
| Git unavailable / not a repo    | Chip shows "not a Git repository". Branches tab disabled with reason. Task and Mission plan intents disabled                                            |
| Environment disconnected        | Banner (`errorSurface`) "devbox is offline. Work there is paused, not lost." Actions disabled. Read-only data stays visible with a "last updated" stamp |
| Partial data (one query failed) | That card shows an inline error with Retry. The others render normally                                                                                  |

### 1.6 Keyboard and focus

- First Tab after the toolbar lands on the project tabs.
- The composer is reachable via `mod+n` (new thread) or by clicking.
- The tool grid uses arrow keys with letter shortcuts while it has focus.
- Attention and Resume are lists with arrow navigation. Enter opens.

### 1.7 Responsive

- **wide/ultrawide:** two-column body (Attention + Running | Resume + Agents) as drawn. Content capped at 1152px.
- **desktop:** two columns. The context column docks at 360px.
- **laptop:**
  - single body column (Attention, Resume, Running, Agents, Composer);
  - context column closed;
  - the "Open a surface" grid moves inline below Resume as a 3-column grid;
  - Notes are reachable via the Notes tab.
- **compact:**
  - tabs scroll horizontally;
  - the composer docks to the bottom;
  - cards stack;
  - the agents strip scrolls horizontally with snap.

### 1.8 Motion

- Cards fade in (`--motion-base`, 0→1 opacity, 4px rise) once on route enter. There is no stagger longer than 120ms total.
- Tab indicator slide.
- Nothing loops except live status dots.

### 1.9 Visual acceptance criteria

- [ ] The active project shows **no** display-size hero. The empty project does.
- [ ] Exactly one solid-violet control in the main column (the composer send button).
- [ ] The context chip is visible without scrolling at 1280×720.
- [ ] Every status in Attention/Resume/Agents shows icon + text.
- [ ] No star count, plan or seat widgets, or fake agent avatars.
- [ ] The light theme passes the same layout with no hard-coded dark colors.

## 2. Provider Connections

**Entry points:**

- sidebar `ProviderReadinessSummary`,
- toolbar `ConnectProvidersCta`,
- `ProviderStatusBanner` action,
- composer disabled reason link,
- palette "Open Provider Connections".

**Container:** `ProviderConnectionsSheet` (right sheet, 560px). Advanced configuration stays at `/settings/providers`.

### 2.1 Desktop layout

```
                                   ┌ Provider Connections ─────────────────── ✕ ┐
                                   │ This Mac (Primary device) ▾      Checked 2m ago  [Check all] │
                                   │ ─────────────────────────────────────────── │
                                   │ NEEDS ATTENTION                             │
                                   │ ┌───────────────────────────────────────────┐│
                                   │ │[Cu] Cursor  Early Access                  ││
                                   │ │     Update required · 2026.01.23 → 2026.04.08  [Update] ›││
                                   │ │     Then: sign in                         ││
                                   │ ├───────────────────────────────────────────┤│
                                   │ │[Gk] Grok  Early Access                    ││
                                   │ │     Sign-in not verified           [Check again] ›││
                                   │ └───────────────────────────────────────────┘│
                                   │ READY                                       │
                                   │ ┌───────────────────────────────────────────┐│
                                   │ │[Cx] Codex   Ready · update available       ││
                                   │ │     ••••@•••• · Subscription · ChatGPT Pro 20x   ›││
                                   │ ├───────────────────────────────────────────┤│
                                   │ │[Cl] Claude  Ready                          ││
                                   │ │     ••••@•••• · Subscription · Claude Max (reported by CLI) ›││
                                   │ └───────────────────────────────────────────┘│
                                   │ DISABLED (2)  ▸                              │
                                   │ ─────────────────────────────────────────── │
                                   │ [+ Add a provider]        Advanced settings →│
                                   └─────────────────────────────────────────────┘
```

The group labels are drawn in caps here for legibility only. The product renders them in sentence case (`type-meta`, medium).

**Detail view** (pushed inside the sheet):

```
 ‹ Back   [Cu] Cursor  · instance cursor · v2026.01.23
 ─────────────────────────────────────────────
 Readiness                                   (ReadinessLadder, stacked)
  ✓ Installed          v2026.01.23 on This Mac
  ✗ Compatible         Needs 2026.04.08 or newer for model picker   [Update]
  ✗ Signed in          Not signed in                               [Sign in…]
  – Account            —
  – Billing route      —
  – Model available    —
  ✗ Ready to execute   Blocked by 2 steps
 ─────────────────────────────────────────────
 How sign-in works for Cursor  (SignInHandoff)
  Signs in through the Cursor Agent CLI. A browser window opens.
  ┌ agent login ───────────────────────── [Copy] ┐
  [Open terminal on This Mac]   [I've signed in. Check again]
 ─────────────────────────────────────────────
 Models (n)   Default: —                      → Advanced settings
```

### 2.2 Information hierarchy

1. Which environment is being configured.
2. What needs attention, and the single next action.
3. What is ready, with account and route.
4. Disabled instances (collapsed).
5. Add a provider or open advanced settings.

### 2.3 Component inventory

| Component                  | Status                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| `ProviderConnectionsSheet` | Proposed                                                            |
| `ProviderConnectionRow`    | Proposed (composes `ProviderInstanceIcon`, `RedactedSensitiveText`) |
| `ReadinessLadder`          | Proposed                                                            |
| `SignInHandoff`            | Proposed                                                            |
| Environment switcher       | Existing (devices picker in `ProviderSettingsPanel`)                |
| Update action              | Existing (`server.updateProvider`, update popover)                  |
| Add provider               | Existing (`AddProviderInstanceDialog`)                              |
| Models section             | Existing (`ProviderModelsSection`), linked, not duplicated          |

### 2.4 The distinctions this screen must make

Each is a separate, visible fact (see [INTERACTION_STATES.md §1](INTERACTION_STATES.md#1-provider-readiness)):

| Fact                                 | Ready example                                                                                     | Not-ready example                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Installed                            | "v0.153.4 on This Mac"                                                                            | "Not installed. How to install →"              |
| Authenticated                        | "Signed in"                                                                                       | "Not signed in" / "Sign-in not verified"       |
| Account verified                     | "••••@••••", reported during this check                                                           | "Account not reported"                         |
| Subscription route known/unknown     | "Subscription · ChatGPT Pro 20x"                                                                  | "Billing route not reported"                   |
| API billing                          | "API billing · OpenAI API key", shown with a ⚠ and the note "Usage is billed to your API account" | —                                              |
| Selected model available/unavailable | "gpt-5 available"                                                                                 | "Selected model isn't offered by this account" |
| Ready to execute                     | "Ready · not yet used here"                                                                       | "Blocked by 2 steps"                           |

### 2.5 Provider-specific content (OpenAI/Codex, Claude, Cursor/Grok, others)

| Provider                      | "How sign-in works" copy                                                                                                                                     | Route note                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex (OpenAI)                | "Signs in with your ChatGPT account through the Codex CLI. A browser window opens. You can also use an OpenAI API key, which is billed to your API account." | Shows the ChatGPT plan when reported. API key → API billing                                                                                 |
| Claude                        | "Signs in through the Claude CLI. Follow the prompts in the terminal."                                                                                       | The plan label is shown as "reported by Claude CLI", with the F4 info note in detail                                                        |
| Cursor                        | "Signs in through the Cursor Agent CLI (`agent login`). A browser window opens."                                                                             | Subscription when reported. Models from other vendors inside Cursor may bill as additional usage. Link to the Cursor dashboard, no estimate |
| Grok (local Grok Build CLI)   | "Signs in through the Grok CLI, or uses an xAI API key you configure."                                                                                       | "Not reported" until the driver reports auth. Never shown as connected to Grok Bots                                                         |
| Antigravity, OpenCode, others | Driver-specific text from the provider metadata. Generic fallback: "Follow {Provider}'s CLI sign-in instructions."                                           | Unknown unless reported                                                                                                                     |

**There is no "Connect with one click" button anywhere.** Every sign-in names its mechanism.

### 2.6 Primary interactions

- Row primary action (Update / Sign in… / Check again / Enable).
- Row click opens detail.
- **Check all** refreshes every instance. Rows show their own spinners. There is no global blocking spinner.
- Environment switcher re-scopes the whole sheet.

### 2.7 States

| State                                                        | Treatment                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| First load                                                   | Rows as skeletons (64px)                                                                    |
| Checking (user-initiated)                                    | Row spinner + `aria-busy`. The headline keeps its last value, muted                         |
| Limited permissions (client lacks `access:write`-equivalent) | Read-only banner (existing). Actions hidden. Facts visible                                  |
| Environment offline                                          | Sheet header error + the last known facts, labelled "as of {time}"                          |
| No providers enabled                                         | Empty state: "No providers enabled on This Mac" + a list of available drivers with "Enable" |
| Update running                                               | Existing update states (queued, running, succeeded, failed, unchanged) inline in the row    |

### 2.8 Keyboard and focus

- The sheet opens with focus on the first row needing attention, or the first row.
- Arrow keys move between rows. Enter opens detail. Backspace or the Back button returns, with focus restored to the originating row.
- Esc closes and returns focus to the launcher.

### 2.9 Responsive

- **compact:** full-screen sheet; detail is a full-screen push.
- **laptop and above:** 560px right sheet.
- **ultrawide:** same width (no stretching).

### 2.10 Motion

- Sheet enter `--motion-sheet`.
- Detail push: 16px slide + fade.
- Status changes crossfade (`--motion-fast`).
- A successful check that changes a headline briefly highlights the row (accent surface, 600ms, once). Under reduced motion there is no highlight; the announcement still fires.

### 2.11 Visual acceptance criteria

- [ ] All five observed fixtures ([states §1.5](INTERACTION_STATES.md#15-observed-states-from-the-running-client-accounts-redacted)) render their expected headline and ladder.
- [ ] No row is green or "Ready" when `auth.status` is `unknown`.
- [ ] API and cloud billing routes are visibly distinct from subscription.
- [ ] Emails are redactable (existing setting) in rows and detail.
- [ ] No sign-in path implies OAuth inside Nebula.

## 3. Branches and Worktrees

**Route:** Project tab "Branches" (proposed route `/projects/$projectKey/branches`, or a Project Home tab panel; Codex picks whichever adds no route-authorization change). **Purpose:** inspect and choose an execution location safely.

### 3.1 Desktop layout

```
 ProjectHeader … [Branches]
 ┌ Toolbar: [Search refs…] [Mine] [Has worktree] [Stale ≥30d]                 [New branch…] ┐
 ├──────────────────────────────────────────────────────────────────────────────────────────┤
 │ Branch            Worktree          Task / Mission     Status        Last commit  PR   Activity │
 │ ⎇ main          ● Current checkout   —                 ●2 ↑0 ↓3     2h           —     ● web    │
 │ ⎇ feat/notes      notes-api          Task: Notes API    ↑4           20m          #41   Codex ●  │
 │ ⎇ fix/sidebar     —                  —                  ↓12          9d           —     —        │
 │ ⎇ nebula/task-42  task-42 ⚠ missing  Task: Tokens pass  —            3d           —     —        │
 └──────────────────────────────────────────────────────────────────────────────────────────┘
                                                        → row click opens WorktreeDetailSheet (480px)
```

### 3.2 Hierarchy

1. The current checkout, pinned first.
2. Branches with worktrees.
3. Branches with activity.
4. Everything else, paginated.

### 3.3 Inventory

| Component                                               | Status                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `BranchInventoryTable`                                  | Proposed                                                                                       |
| `WorktreeDetailSheet`                                   | Proposed                                                                                       |
| `SwitchGuardDialog`                                     | Proposed                                                                                       |
| Ref search and pagination, create ref                   | Existing (from `BranchToolbarBranchSelector` data)                                             |
| PR association                                          | Existing                                                                                       |
| Composite query (worktree ↔ Task ↔ sessions ↔ services) | **Backend proposed** (audit PR 5). Until it exists, columns without data are hidden, not faked |

### 3.4 Interactions

- **Inspect:** detail sheet.
- **Open workspace:** if a worktree exists, open it. Otherwise create a worktree through the existing worktree flow, then open it.
- **Switch checkout…:** runs the guarded sequence ([states §4](INTERACTION_STATES.md#4-context-switching)).
- **Remove worktree…:** only from the detail sheet, after a fresh assessment.

### 3.5 States

- Non-Git folder: empty state "This project isn't a Git repository".
- Detached HEAD: pinned row shows `detached @ sha`.
- Stale data: "Updated {time}" + Refresh.
- Missing worktree: error badge in the row.
- Busy checkout: activity column plus the switch guard.
- Remote unavailable: PR and behind columns show "—" with a tooltip reason.

### 3.6 Keyboard

- The table is a grid (`role="grid"`) with arrow navigation.
- Enter opens detail. `o` (with the grid focused) runs Open workspace.

### 3.7 Responsive

- **≥1024px:** table.
- **Below:**
  - two-line rows: branch + status, then worktree + Task;
  - detail as a full-height sheet;
  - filters in a menu.

### 3.8 Motion

The detail sheet slides in (`--motion-sheet`). The table itself never animates on refresh: changed cells briefly show `accentSurface` (once, 600ms).

### 3.9 Acceptance

- [ ] No action mutates a checkout without the guard.
- [ ] "Stale" never appears next to a delete affordance.
- [ ] The current checkout is always first and labelled.
- [ ] Remote environments show the environment label in the header.

## 4. Unified Workbench

**Route:** thread route (`/_chat/$environmentId/$threadId`) plus Project Terminal Center layouts. **Purpose:** keep coding, inspection and execution adjacent.

### 4.1 Desktop layout (thread with surfaces)

```
┌ Sidebar ┬ Toolbar: env ▸ Project ▾ ▸ Thread title   [⎇ feat/notes · notes-api · Task: Notes API]   [▣Term ▣Files ▣Diff ▣Preview ▣Agents 2] [Run ▾][Open ▾][Commit ▾] ┐
│         ├──────────────────────────── Chat (anchor) ───────────────┬─ Context panel (tabs) ───────────┐
│         │ transcript…                                               │ [Preview ×][Diff ×][+]           │
│         │                                                           │ ┌ localhost:5733 on This Mac ──┐ │
│         │                                                           │ │                              │ │
│         │ ┌ Composer ────────────────────────────────────────────┐  │ │      (Preview surface)       │ │
│         │ │ …                                                     │  │ └──────────────────────────────┘ │
│         │ └───────────────────────────────────────────────────────┘  │                                  │
│         ├──────────────────────────── Terminal floor (⌘J) ──────────┴──────────────────────────────────┤
│         │ [Shell · This Mac · notes-api] [Codex CLI · Separate session, not linked to this chat] [+]       │
└─────────┴───────────────────────────────────────────────────────────────────────────────────────────────┘
```

On **ultrawide** (≥2560px), the main area may split into two work surfaces (for example Chat | File editor) using the existing terminal-workspace split model. The context panel remains optional.

### 4.2 Hierarchy

1. The conversation and its composer.
2. The surface the user opened last.
3. Terminal output.
4. Everything else.

### 4.3 Inventory

| Component                                                                        | Status                                       |
| -------------------------------------------------------------------------------- | -------------------------------------------- |
| `ChatHeader` + `ExecutionContextChip`                                            | Extend + Proposed                            |
| `SurfaceToggleGroup`                                                             | Extend (`PanelLayoutControls`)               |
| `RightPanelTabs`, `RightPanelSheet`, `rightPanelStore`                           | Existing                                     |
| `ToolTileGrid` as the context-panel empty state                                  | Extend                                       |
| `ThreadTerminalDrawer` + `PaneIdentityHeader`                                    | Existing + Proposed                          |
| `FilePreviewPanel` (editor), `FileBrowserPanel`                                  | Existing                                     |
| `DiffPanel`                                                                      | Existing                                     |
| `PreviewPanel` / `PreviewEmptyState` / `PreviewUnreachable`                      | Existing                                     |
| `AgentsPanel`                                                                    | Existing                                     |
| `ProjectTerminalWorkspace` layouts (Workbench / Preview / Build + Preview modes) | Existing; headers adopt `PaneIdentityHeader` |

### 4.4 Interactions

- Toggles open or close surfaces. `+` in the tab bar adds a surface.
- Drag the context panel edge to resize (persisted, existing).
- `rightPanel.toggleMaximized` maximizes the context panel. **Proposed default key:** none until conflict-checked.
- Editor: save (`mod+s` in editor focus; existing), file/line reveal from chat links, "Open in editor" (existing `OpenInPicker`).

### 4.5 States

| State                              | Treatment                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Preview on web client              | `PreviewPanel` existing message restyled as an empty state: "Preview runs in the Nebula desktop app." + "Open localhost:5733 in browser" |
| Remote preview                     | Header shows "on {env}". A localhost link warns "This is {env}'s localhost"                                                              |
| Resource restored after restart    | Surface tab shows normally                                                                                                               |
| Resource missing                   | Tab shows `⚠` + "Terminal exited" / "File no longer exists" with Close. **Commands are never replayed automatically**                    |
| Editor dirty during context switch | Blocking prompt via existing `fileEditorDismissal`                                                                                       |
| Save failure                       | [states §6](INTERACTION_STATES.md#6-save-states-notes-file-editor)                                                                       |

### 4.6 Keyboard

Existing shortcuts unchanged:

- `mod+j` terminal,
- `mod+alt+b` panel,
- `mod+shift+j` preview,
- `mod+d` diff (outside terminal),
- `mod+p` files.

The toggle group is one Tab stop. In the terminal, focus owns keys.

### 4.7 Responsive

- **ultrawide:** optional dual work surface.
- **desktop:** chat + docked panel + floor.
- **laptop:**
  - panel docked above 980px, sheet below (existing);
  - toggle labels hidden.
- **compact:**
  - one surface at a time;
  - surfaces open as full-height sheets;
  - the terminal becomes a sheet.

### 4.8 Motion

- Panel open/close: `--motion-panel`.
- Pane layout changes: the existing view-transition morph (180ms).
- Terminal floor resize follows the pointer.

### 4.9 Acceptance

- [ ] Toggle pressed states always match actual surface visibility.
- [ ] Every terminal pane states its environment and worktree, and provider CLI panes say "Separate session".
- [ ] Closing a preview leaves its server running (verify via Running services).
- [ ] No third pane store, and no Workbench-only copy of surface state.

## 5. Native Notes

**Proposed. Requires audit Phase 4 backend (revisioned persistence, authorization).** Project tab "Notes" and the Project Home notes card.

### 5.1 Desktop layout

```
 ProjectHeader … [Notes]
 ┌ NotesList 320 ──────────────┬ NoteEditor ──────────────────────────────────────────────────┐
 │ [Search notes…]   [+ New]    │ Architecture decisions                                       │
 │ All · Pinned · Decisions ·…  │ Project · Decision · Attachable ▾ · rev 7 · ✓ Saved     [⋯] │
 │ ★ Product direction      2h  │ ───────────────────────────────────────────────────────────  │
 │   Release checklist      1d  │ [Write | Preview]                                            │
 │ ● Architecture decisions 3d  │ ## Context …                                                 │
 │   Ideas / backlog        4d  │                                                              │
 │   Onboarding flow        1w  │                                                              │
 └──────────────────────────────┴──────────────────────────────────────────────────────────────┘
```

### 5.2 Hierarchy

1. The note being edited and its save state.
2. Pinned notes.
3. Recent notes.
4. Revision history (drawer).

### 5.3 Inventory

`NotesList`, `NoteEditor`, `NoteRevisionDrawer`, `NoteAttachChip`, `NoteAgentPolicySelect`. All Proposed. They reuse Markdown rendering (`ChatMarkdown`/file editor) and `ui/*` primitives.

### 5.4 Interactions

- Create.
- Edit (autosave after 800ms idle, plus `mod+s`).
- Pin.
- Categorize.
- Change agent policy.
- Search.
- Archive and restore.
- History, and restore a revision as a new revision.
- Export Markdown.
- Import Markdown (creates a new note; never overwrites).
- "Attach to composer" pins the current revision as a chip.
- Agent proposals arrive as "Proposed revision" with a diff and Accept / Reject. Only a human write commits.

### 5.5 States

- empty ("No notes yet. Capture a decision, spec or idea."),
- loading,
- saving,
- saved,
- failed (text kept),
- conflict (compare),
- environment unavailable (read-only cached view, labelled),
- protected (agents see "Protected; propose changes").

### 5.6 Keyboard

- `notes.new` command, palette only by default.
- The list uses arrow keys and Enter.
- In the editor, Esc moves focus to the list. Text is never discarded.

### 5.7 Responsive

- **≥1024px:** split list and editor.
- **Below:** list → editor push, with an unsaved-text guard.

### 5.8 Motion

- The save-state icon crossfades.
- No typing animations.

### 5.9 Acceptance

- [ ] Save state is always visible.
- [ ] Notes never auto-attach to agents.
- [ ] The attach chip pins a revision number.
- [ ] Notes are never stored in a worktree path.
- [ ] Category color is always paired with a text label.

## 6. Composer / Chat

**Route:** thread and draft routes. **Purpose:** continue one conversation with explicit intent and execution context.

### 6.1 Layout (composer region, 768px max)

```
 ┌ Composer (glass shell, radius 22) ───────────────────────────────────────────────────────┐
 │ [chip: Note · Architecture rev 7 ×] [chip: src/app.tsx ×] [img thumb ×]                  │
 │ Ask Nebula to build, fix, or explore anything in this project…                            │
 │                                                                                           │
 │ [+] [Chat | Analyze | Task | Mission plan]  [Cx gpt-5 ▾] [High · 1M ▾] [🔒 Supervised ▾]  ◔ [↑] │
 └───────────────────────────────────────────────────────────────────────────────────────────┘
   [🖥 This Mac ▾]  [Workspace: New worktree ▾]  [⎇ main ▾]          (context strip; locked after send)
```

### 6.2 Hierarchy

1. The draft text.
2. The primary action: label by intent.
3. Intent.
4. Provider/model and Access.
5. The context strip.
6. Context chips.
7. Meters (context window, stash, tasks badges; existing).

### 6.3 Inventory

| Component                                              | Status                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `ChatComposer` shell, editor, slash/`@`/`$` menus      | Existing                                                            |
| `IntentControl`                                        | Proposed                                                            |
| `ComposerAttachMenu`                                   | Proposed                                                            |
| `ProviderModelPicker` (+ readiness)                    | Extend                                                              |
| `TraitsPicker`, runtime-mode select, Build/Plan toggle | Existing (fix the "Chat/Plan" label in compact menu → "Build/Plan") |
| `ComposerPrimaryActions`                               | Extend (intent labels)                                              |
| Pending approval/question panels, plan banner/card     | Existing (restyled)                                                 |
| `BranchToolbar` context strip                          | Existing                                                            |
| `ContextWindowMeter`, stash, tasks badges              | Existing                                                            |

### 6.4 Interactions

- Choose intent; the primary label updates.
- Send / Analyze / Create Task / Generate plan.
- Stop.
- Answer questions.
- Approve or decline.
- Attach via "+", paste or drop.
- `@` mention files.
- `/` commands.
- `$` skills.

### 6.5 States

See [states §5](INTERACTION_STATES.md#5-composer-states). Additional:

- unsupported attachment type/model: inline error under the chip ("{model} doesn't accept images");
- quota or rate-limited (provider-reported): warning banner with the provider's message and reset time when reported;
- missing worktree: the context strip shows error and send is disabled with "Recreate or choose a workspace".

### 6.6 Keyboard

- Enter sends (existing setting).
- Shift+Enter inserts a newline.
- `mod+shift+m` opens the model picker.
- `composer.intent.next` (proposed) cycles intent.
- The approval panel takes focus when it appears only if the composer was focused. Otherwise it announces politely.

### 6.7 Responsive

Existing container breakpoints apply: compact below 620px, or below 780px with wide actions.

- In compact, intent, traits and access collapse into `CompactComposerControlsMenu`, which gets an Intent section.
- The context strip collapses to `MobileRunContextSelector` (existing).

### 6.8 Motion

- The intent change crossfades the primary label (`--motion-fast`).
- Chips add and remove with scale 0.96→1 and fade (`--motion-base`).
- The composer focus glow fades in (`--motion-fast`).

### 6.9 Acceptance

- [ ] Access level is visible in every intent.
- [ ] Analyze is never enabled without enforced read-only.
- [ ] Mission plan never shows "Run" or execution language.
- [ ] Provider and model shown = the instance that will receive the turn.
- [ ] The context strip is locked after the first send.

## 7. Agents Hub

**Surfaces:**

- the Project Home agents strip,
- a full "Agents" view (Project tab or a palette destination; proposed),
- the existing `AgentsPanel` right-panel surface for native subagents.

### 7.1 Full view layout

```
 Agents · Nebula OSP
 ┌ Active sessions (3) ───────────────────────────────────────────────────────────────┐
 │ [Cx●] Notes API          Builder   notes-api · gpt-5        Working        12m  [Open] │
 │ [Cl●] Review: Notes API  Reviewer  notes-api · claude-…     Pending Approval  2m [Review]│
 │ [Cu ] Tokens pass        —         task-42 · …              Completed       1h  [Open] │
 └─────────────────────────────────────────────────────────────────────────────────────┘
 ┌ Saved roles (templates) ───────────────────┐ ┌ Provider connections ────────────────┐
 │ [◇] Planner   Template · Claude · opus  [Use]│ │ Codex ✓ Ready · Claude ✓ Ready       │
 │ [◇] Reviewer  Template · Codex · gpt-5  [Use]│ │ Cursor ✗ Update required  [Fix]      │
 └────────────────────────────────────────────┘ └─────────────────────────────────────┘
 ┌ External collaborators ─────────────────────────────────────────────────────────────┐
 │ [↗] Release Bot (Grok)   External · status unknown   [Open] [Prepare handoff] [Import] │
 └─────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Hierarchy

Active sessions, then needs-attention sessions (sorted first within the active group), then provider readiness, then templates, then external collaborators.

### 7.3 Inventory

| Component                         | Status                                                        |
| --------------------------------- | ------------------------------------------------------------- |
| `AgentsOverview`                  | Proposed                                                      |
| `AgentSessionCard` / row          | Proposed (existing thread/Task status data)                   |
| `RoleTemplateCard`                | Proposed; **data proposed**, hidden until role settings exist |
| `ExternalCollaboratorRow`         | Proposed; **data proposed**, hidden until references exist    |
| `ProviderConnectionRow` (compact) | Proposed                                                      |
| `AgentsPanel`                     | Existing                                                      |

### 7.4 Interactions

- Open thread or Task.
- Review (deep link to the approval).
- Stop: existing interrupt, with confirmation.
- Use template: prefills composer intent, provider and model; does not run.
- External: open the official app, prepare a handoff (explicit context selection), import a result into Notes or a Task attachment as **external evidence**.

### 7.5 States

- No sessions: "No agents running" + Start thread / Run a Swarm.
- Disconnected session: "Disconnected", muted, last update time.
- Provider unavailable: row warning linking to Connections.
- External: always "status unknown".

### 7.6 Keyboard

- Groups are landmarks (`region` with heading).
- Rows use arrow navigation. Enter opens.

### 7.7 Responsive

- Rows have stable heights. Details expand inline. The groups stack on laptop and compact.
- Strip on Home: horizontal scroll with snap on compact.

### 7.8 Motion

- Only the live status dots pulse (duty-cycled).
- Row reorder on status change: no animation, to avoid list jumping under the pointer. New rows fade in.

### 7.9 Acceptance

- [ ] No green or live dot on templates or external collaborators.
- [ ] A role chip on a session is the role it was started with. It is not inferred.
- [ ] Native subagents are not double-listed as top-level sessions.

## 8. Swarm entry and Mission navigation

**Routes:** existing `/projects/$key/command-deck` (Tasks / Missions / Integration) and `?mode=swarm&stage=brief|plan|war-room|review`. **Purpose:** enter supervised orchestration without confusing chat with execution approval.

### 8.1 Layout

```
 Toolbar: Project ▾ ▸ Swarm
 ┌ MissionStageNav ───────────────────────────────────────────────────────────────────┐
 │ ① Swarm Brief ✓   ② Team Plan ●   ③ War Room 🔒 Approve the plan to continue   ④ Review & Integration 🔒 │
 └────────────────────────────────────────────────────────────────────────────────────┘
 (existing SwarmWorkspace stage content)
 Plan review: [Edit] [Assign providers]        [Approve plan]  ← explicit, separate
 War Room:    Run policy summary               [Authorize run] ← explicit, separate
```

### 8.2 Hierarchy

1. Which stage you are in.
2. What is gated, and why.
3. Stage content.
4. The single explicit authority action for the stage.

### 8.3 Inventory

| Component                                                                                           | Status                                                    |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Sidebar Swarm destination                                                                           | Extend (`SidebarSwarmModeButton`)                         |
| `MissionStageNav`                                                                                   | Extend (existing "Swarm workflow" nav)                    |
| `SwarmWorkspace`, `ArchitectPlanPanel`, `MissionCommandCenter`, `IntegrationPanel`, `TaskInspector` | Existing                                                  |
| Composer "Mission plan" intent                                                                      | Proposed; it only creates a proposal and lands in stage ② |

### 8.4 Interactions

- Generate plan (from Brief or the composer intent).
- Edit and assign providers.
- **Approve plan** (explicit).
- **Authorize run** (explicit, separate).
- Pause or stop scheduling.
- Inspect a Task.
- Review integration evidence.

### 8.5 States

- draft plan,
- invalid proposal (validation errors listed),
- dependency or resource blocked,
- provider unavailable (link to Connections),
- attention required,
- review rejected,
- integration conflict (paused, with evidence link).

Each uses the status families with icon + text.

### 8.6 Keyboard

- The stage nav is a tablist.
- Authority buttons are never the default Enter action of a form. They require an explicit click or Space on a focused button.

### 8.7 Responsive

- The desktop keeps full engineering controls.
- Laptop and compact emphasize the stage status and the authority actions. Dense DAG views scroll horizontally and are not compressed.

### 8.8 Motion

- The stage indicator slides.
- Stage content crossfades (`--motion-base`).
- No celebratory animation on approval.

### 8.9 Acceptance

- [ ] Approve plan and Authorize run are visually and spatially separate, each with its own confirmation copy.
- [ ] No chat surface contains an "Approve run" control.
- [ ] Gated stages explain the gate.
- [ ] Nebula never merges `main`, and no UI copy implies it will.
