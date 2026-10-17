# Project OS V2 design

**Status:** Proposed (D4), pending founder approval. Design only; no runtime change.

**Companion documents:** [package README](README.md) · [engineering handoff](PROJECT_OS_HANDOFF.md) · [visual reference](reference/project-os.html) · foundation [contract](../SUPER_ADE_DESIGN_CONTRACT.md), [tokens](../DESIGN_TOKENS.md), [states](../INTERACTION_STATES.md), [components](../COMPONENT_SPECIFICATIONS.md), [screens](../SCREEN_BLUEPRINTS.md), [QA](../VISUAL_QA_CHECKLIST.md).

Code paths resolve at `main` `784473fb5` unless marked **E3** (`131085ff8`).

## 0. Design verdict

**Ready for engineering in four bounded slices, with two server additions and one behavior change that need founder sign-off.**

Nebula already owns almost every primitive Project OS needs: canonical Threads with session and approval state, Tasks with isolated worktrees and attention derivation, Missions with checkpoints and run attention, Integration Batches with conflict state, named Terminal Workspaces with honest hide-versus-stop semantics, approved Dev Server profiles, port discovery that links listeners to Nebula terminals, and per-checkout VCS status. What it lacks is **composition**: there is no project navigation, no project-level view of attention, no inventory that joins branches to worktrees to the work running in them, and no guard in front of the one mutation that can damage active work.

Three findings shape the design:

1. **The branch picker can switch an active checkout today.** `BranchToolbarBranchSelector.tsx` calls `vcs.switchRef` on the thread's checkout while a session runs, and `vcs.switchRef` has no server-side dirty, session or ownership check (`GitVcsDriverCore.ts` `switchRef`). The guarded switch in E4.4 is a safety fix, not only a new screen. It changes existing behavior (founder decision **P5**).
2. **Project identity is not environment-scoped in the URL.** For a Git-backed project, `deriveLogicalProjectKey` returns the repository's canonical key, which merges checkouts on every environment. Project pages silently use the primary-environment member. Terminal Workspace state is keyed by bare `ProjectId` (`uiStateStore.ts`). Project OS makes the checkout explicit everywhere (decision **P3**).
3. **The safe alternatives already exist.** `vcs.createWorktree`, `useNewThreadHandler(projectRef, { branch, worktreePath, envMode })`, Terminal Workspace Task-bound panes and `hideWorkspacePane` give us "Open in a new worktree" and "close without stopping" without new runtime.

Rejected directions: a second sidebar, a project dashboard nested inside Terminal Center, a Project Home composer runtime, a client-side "switch safety" check, per-ref ahead/behind computed by the client, a fake Notes surface, and any "Switch anyway" or "Stash and switch" action.

## 1. Repository ground truth

| Area              | Exists today                                                                                                                                                                                                                                                                                       | Missing (named where E4 adds it)                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shell             | `AppSidebarLayout` (offcanvas, resizable, `chat_thread_sidebar_width`); default `Sidebar.tsx` is a cross-project thread inbox with a project scope menu whose rows hold five icon buttons; `LegacySidebar.tsx` is a project tree behind `legacySidebarEnabled`                                     | Project navigation; persistent active project (scope is component state)                                                                                     |
| Project routes    | `/projects/$projectKey` (`ProjectLaunchpad`), `/command-deck` (Command Deck, `mode=swarm` for Swarm), `/terminal-center?taskId`, `/settings`. Global `/terminal-center`, `/pull-requests`, `/usage`, `/settings/*`                                                                                 | `/projects/$projectKey/branches` (E4.3); checkout search parameter (E4.1); Command Deck `selectedTask` outside Swarm mode (E4.2)                             |
| Identity          | `derivePhysicalProjectKey` = `${environmentId}:${root}`; `deriveLogicalProjectKey` = repository canonical key; `buildSidebarProjectSnapshots` exposes `environmentPresence` and `remoteEnvironmentLabels`                                                                                          | Visible checkout on project screens; environment-scoped Terminal Workspace keys                                                                              |
| Attention signals | Thread shell `hasPendingApprovals`, `hasPendingUserInput`, `hasActionableProposedPlan`, `session.status`, `latestTurn.state`; `deriveTaskAttention` (`commandDeckLogic.ts`); `missionAttentionItems` (`missionCommandCenterViewModel.ts`); `IntegrationBatch.status`; E1 `deriveProviderReadiness` | One project-level derivation (E4.2, client-only)                                                                                                             |
| Git               | `vcs.listRefs` (name, current, isDefault, worktreePath), `subscribeVcsStatus` / `vcs.refreshStatus` per `cwd` (ref, dirty files, ahead/behind, `hasUpstream`, PR), `vcs.createWorktree`, `vcs.createRef`, `vcs.switchRef`, `vcs.removeWorktree`                                                    | Full worktree list incl. detached and missing (E4.3); HEAD SHA and commit time per ref (E4.3); untracked count (E4.3); switch and removal assessments (E4.4) |
| Ownership         | `OrchestrationThread.branch/worktreePath`; `OrchestrationTask.workspace` (`preparing…removed`, branch `nebula/manual/<id>-<slug>`); `Mission.taskIds`; `IntegrationBatch.branch/workspacePath`                                                                                                     | —                                                                                                                                                            |
| Processes         | `TerminalSummary` (`cwd`, `worktreePath`, `status`, `hasRunningSubprocess`, `label`); `DiscoveredLocalServer.terminal`; `DevServerProfile`; Terminal Workspace `pane.externalServer`                                                                                                               | A shared server ownership registry (not needed for E4; ownership is derived, see §8)                                                                         |
| Workspaces        | Named Terminal Workspaces per project (`terminalWorkspace.ts`), modes workbench / preview / build_preview, pane kinds shell, provider/thread, dev_server, preview, tests, logs, git, diff, file; hide ≠ stop                                                                                       | Workspace switcher outside Terminal Center; shared pane identity labels                                                                                      |
| Composer          | `ChatComposer` inside `ChatView` only; drafts via `useNewThreadHandler` and `composerDraftStore`                                                                                                                                                                                                   | Nothing new: Project Home hands off to a draft                                                                                                               |
| Notes             | —                                                                                                                                                                                                                                                                                                  | Everything. Gated on its own backend phase                                                                                                                   |

## 2. Information architecture

### 2.1 Destinations

| Level       | Destination          | Route                                              | Status                    | Notes                                                                          |
| ----------- | -------------------- | -------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| Global      | New thread           | draft route                                        | Existing                  | `chat.new`                                                                     |
| Global      | Swarm                | `/projects/$key/command-deck?mode=swarm`           | Existing                  | Status button stays at the top of the sidebar                                  |
| Global      | Terminal Center      | `/terminal-center`                                 | Existing                  | Fleet overview across projects. Label unchanged                                |
| Global      | Threads inbox        | sidebar body                                       | Existing                  | Gains a "This project / All projects" filter                                   |
| Global      | Pull Requests, Usage | `/pull-requests`, `/usage`                         | Existing                  | Footer                                                                         |
| Global      | Settings             | `/settings/*`                                      | Existing                  | Footer                                                                         |
| Global      | Provider Connections | sheet over the current route (`connections=…`)     | **E3**                    | Sidebar entry `ProviderConnectionEntry`                                        |
| **Project** | **Overview**         | `/projects/$key`                                   | Extend `ProjectLaunchpad` | Project Home (§3)                                                              |
| **Project** | **Workbench**        | `/projects/$key/terminal-center`                   | Existing route, new label | The project's Terminal Workspaces (§6). Route path unchanged (decision **P2**) |
| **Project** | **Tasks**            | `/projects/$key/command-deck`                      | Existing                  | Command Deck: Tasks, Missions, Integration. Swarm stays a mode of it           |
| **Project** | **Branches**         | `/projects/$key/branches`                          | Proposed route (E4.3)     | Branches & Worktrees (§4). Hidden from navigation until E4.3 ships             |
| **Project** | **Notes**            | none                                               | Gated                     | Not rendered until the Notes backend exists (§9)                               |
| **Project** | **Settings**         | `/projects/$key/settings`                          | Existing                  | Moves to the bottom of the project list                                        |
| Action      | Files                | `filePicker.toggle` (`mod+p`), Workbench file pane | Existing                  | Not a destination in E4 (decision **P4**)                                      |

The sidebar shows global destinations above and below the **Projects** section. Project destinations exist only inside the active project's disclosure. There is no in-page tab row at ≥768px (decision **P1**), no project dashboard inside Terminal Center, and no second sidebar.

### 2.2 Active project and active checkout

- **Active project** is the logical project of the current route (`/projects/$key/*`, or a thread's project). On global routes it is the last active project, persisted per client (new key in `uiStateStore`). This replaces the unpersisted `projectScopeKey`.
- **Active checkout** is one member of that logical project: a scoped project ref `{ environmentId, projectId }`. Every project route accepts a `checkout` search parameter carrying that ref (encoding chosen by Codex, identifier-safe like E3's `connectionsEnv`; never a filesystem path). Without it, the route resolves today's representative (primary environment preferred) and **displays** which checkout that is.
- The checkout is always visible on project screens: environment icon and label, plus the start-truncated root path. A remote checkout always shows its environment label. A project with more than one checkout shows a **Checkout ▾** switcher that lists each member with its environment, path and connection state.
- Switching checkout changes only the `checkout` parameter. It never moves a thread, Task or terminal.
- Per-project client state that can differ by checkout (Terminal Workspaces, last workspace, Home filters) is keyed by the scoped ref, not by bare `ProjectId`. Existing `terminalWorkspacesByProjectId` entries migrate to the primary-environment member on first read.

### 2.3 Switching between projects in different environments

| From → to                                               | Behavior                                                                                                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local project → remote-only project                     | Sidebar row already shows a cloud glyph and the environment label in its tooltip. Overview header shows `☁ devbox` before the path. Every action that writes names devbox in its confirmation             |
| Project with checkouts on two environments              | Overview opens the last-used checkout for that project (scoped ref persisted), else the representative. The checkout switcher sits in the header                                                          |
| Target environment disconnected                         | Navigation succeeds. The page renders cached read data with "devbox is offline · last updated 4m ago" (`errorSurface` banner) and disables every action that needs the server. Work is "paused, not lost" |
| Target environment requires re-pairing or update        | Same banner with the existing connection recovery action from Settings → Connections                                                                                                                      |
| Thread opened from the inbox belongs to another project | Active project follows the thread. The previous project collapses. Nothing is stopped                                                                                                                     |

### 2.4 URL behavior

- Project destinations are siblings (`$projectKey_` routes). Each preserves `checkout` when navigating between project destinations.
- Grouping-mode changes rewrite `projectKey`. Project Settings already follows the project to its successor key. E4.1 extends that successor lookup to every project route instead of showing "This project is no longer available."
- Deep links from Overview carry existing parameters only (`/$environmentId/$threadId`, Command Deck `mode/stage/missionId/proposalId/selectedTask`, Terminal Center `taskId`, E3 `connections/connectionsEnv`). `selectedTask` outside Swarm mode needs a `validateSearch` change (E4.2).

## 3. Screen A — Project Home (Overview)

**Route:** `/projects/$projectKey` (extend `ProjectLaunchpadPage`). **Job:** answer "what's happening here, what needs me, where do I resume?" in one screen.

### 3.1 Layout (1440 × 900, active project)

```
┌ Sidebar 256 ─────────┬ Header 52 ────────────────────────────────────────────────────────────────────────┐
│ ◆ Nebula   Super ADE │ Halo Console ▾ · Overview                       [Open in ▾] [Workbench] [⋯]        │
│ [Search threads  ⌘K] ├────────────────────────────────────────────────────────────────────────────────────┤
│ [+ New thread    ⌘N] │ ▣ Halo Console                                                                     │
│ Swarm · 2 active     │   🖥 This Mac · …/Code/halo-console   ⎇ main · Current checkout   ●3  ↑1 ↓0   PR —  │
│ Terminal Center      │                                                                                    │
│ PROJECTS             │ Needs you · 3 ───────────────────────────────────────────────────────────────────  │
│ ▾ ▣ Halo Console  3  │ ⏸ Approval needed  Run `pnpm test` · "Payment retry"   ⎇ task-7f3a   [Review]       │
│   🖥 This Mac · main │ ? Waiting for your answer  "Checkout copy pass"        ⎇ main        [Answer]       │
│   Overview        ●  │ ⚑ Checkpoint needs approval  Mission "Billing v2" · Wave 2          [Open Swarm]   │
│   Workbench          │                                                                                    │
│   Tasks           2  │ ┌ Resume ─────────────────────────────┐ ┌ Live now ────────────────────────────┐  │
│   Branches           │ │ [All] Threads  Tasks  Missions       │ │ Agents · 2 working                    │  │
│   Settings           │ │ ● Working  Payment retry  Codex 4m   │ │ ◉ Codex  Payment retry  Working 4m    │  │
│ ▸ ▣ billing-api   ☁  │ │ ⏸ Approval Fix sidebar overflow  2m  │ │ ◉ Claude Checkout copy  Waiting       │  │
│ ▸ ▣ design-tokens    │ │ ◆ Task  Payment retry · Active 1h    │ │ Services                              │  │
│ All projects…        │ │ ◇ Mission Billing v2 · Attention     │ │ ● web  localhost:5173  Nebula  [Prev] │  │
│ THREADS  [This▾]     │ │ ✓ Done  Tokens pass        yesterday │ │ ○ storybook :6006  Discovered [Attach]│  │
│ …inbox…              │ └──────────────────────────────────────┘ │ Terminals · 3 open · 1 busy           │  │
│ ─────────────        │ ┌ Branches ─────────────────────────────┐ └──────────────────────────────────────┘  │
│ Providers 2 ready    │ │ 4 worktrees · 1 dirty · 1 Task-owned  [Open Branches]                         │  │
│ ⚙  ⇅  ▤              │ └────────────────────────────────────────────────────────────────────────────────┘  │
│                      │ ┌ Start new work ──────────────────────────────────────────────────────────────┐  │
│                      │ │ Describe a change, bug or question…                         ⎇ main · Codex  [↑]│  │
│                      │ │ New Task   Plan a Mission                                                       │  │
│                      │ └────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────┴────────────────────────────────────────────────────────────────────────────────────┘
```

Content column is capped at `--content-max-width` (1152px) and centered. The right context panel is not used on Overview; Project Home has no tool grid of its own (the tool tiles stay the context panel empty state in the Workbench and chat).

### 3.2 Hierarchy

1. **Execution context** (header block): project, checkout (environment + path), branch, worktree label, dirty / ahead / behind, PR. For a thread-less Overview the context is the checkout's root, never a guessed worktree.
2. **Needs you** (only when non-empty; otherwise one quiet line "Nothing needs you right now").
3. **Resume** and **Live now**, side by side at ≥1280px.
4. **Branches** summary strip (E4.3; hidden until the inventory exists).
5. **Start new work** launch bar.

No hero in an active project. No vanity metrics, plan tiles or decorative glow.

### 3.3 Needs you

Each row: tone icon + label (never color alone) · what (thread, Task or Mission title) · where (worktree label or "Current checkout", environment when remote) · age · one action. Rows sort by **decision class**, then age: (1) blocking human decisions, (2) failures and interruptions, (3) review outcomes, (4) access problems. Four rows by default, then "Show all 7" expands in place.

| Kind                     | Source (exists today)                                                                                                  | Row label                               | Action → destination                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Agent approval           | Thread shell `hasPendingApprovals`                                                                                     | "Approval needed"                       | **Review** → `/$environmentId/$threadId` (composer approval panel)                        |
| Awaiting input           | Thread shell `hasPendingUserInput`                                                                                     | "Waiting for your answer"               | **Answer** → thread                                                                       |
| Plan ready               | Thread shell `hasActionableProposedPlan`                                                                               | "Plan ready to review"                  | **Open plan** → thread                                                                    |
| Mission checkpoint       | `MissionCheckpoint.humanApprovalRequired` and not approved; run decision `waiting_checkpoint`                          | "Checkpoint needs approval"             | **Open Swarm** → `command-deck?mode=swarm&stage=war-room&missionId=`                      |
| Architect plan ready     | `ArchitectPlanProposal.status = ready` on the project shell                                                            | "Mission plan ready for approval"       | **Review plan** → `command-deck?mode=swarm&stage=plan&proposalId=`                        |
| Replan / coordination    | `ReplanProposal.status = awaiting_approval`; `CoordinationRequest.status = pending`; provider escalation `recommended` | "Mission decision needed"               | **Open** → Swarm war room for that Mission                                                |
| Mission run attention    | `MissionRun.status = attention`, `attention[]`                                                                         | First `attention[].detail`, verbatim    | **Open** → Swarm war room                                                                 |
| Session failed           | `session.status = error` (`lastError` in details)                                                                      | "Agent stopped with an error"           | **Open** → thread                                                                         |
| Turn interrupted         | `session.status = interrupted` or `latestTurn.state = interrupted`                                                     | "Interrupted"                           | **Open** → thread. The sidebar does not flag this today; Home does                        |
| Task needs attention     | `deriveTaskAttention` (workspace failed/missing, ownership violation, gate failed, provider error, review stale)       | The derived reason, verbatim            | **Open Task** → `command-deck?selectedTask=` (needs E4.2 `validateSearch` change)         |
| Review changes requested | Current `TaskReview.verdict = request_changes` or `reject`                                                             | "Changes requested" / "Review rejected" | **Open review** → Task (as above)                                                         |
| Integration conflict     | Project shell `integrationBatches[].status = conflict` (`correction_required` shown the same, with its own label)      | "Integration conflict in 2 files"       | **Resolve** → Command Deck Integration (Mission batches: Swarm `stage=review&missionId=`) |
| Provider blocked         | E1 `deriveProviderReadiness` for an enabled instance used by this project's threads or Tasks; E3 connection status     | "Codex needs sign-in on This Mac"       | **Fix** → E3 sheet `?connections=<instanceId>&connectionsEnv=`                            |

**Not shown:** "Working" is not attention. Stale provider readiness is never attention (it is "Not verified", neutral). Completed work is not attention.

Data: one pure function over the active checkout's environment snapshot, the project shell and provider snapshots (see handoff §2.2). No new server query, no persisted second blocker list.

### 3.4 Resume

One list with a segmented filter **All · Threads · Tasks · Missions** (filter persisted per scoped project).

| Item    | Row anatomy (44px)                                                                                                                      | Sort key                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Thread  | status pill (existing vocabulary) · title · `⎇ branch · worktree label` (mono, meta) · provider mark + model short name · relative time | `latestUserMessageAt`, else `updatedAt`   |
| Task    | Task glyph · title · lifecycle (`draft/active/completed/cancelled`) + workspace state when not ready · role · provider · time           | `updatedAt`                               |
| Mission | Mission glyph · title · run status (`running/paused/attention/…`) · "Wave n" when present · Task count                                  | run `updatedAt`, else Mission `updatedAt` |

- Threads belonging to a Task show the Task chip and are listed once (under the Task when filtered to Tasks, as the thread otherwise).
- Settled and archived threads are excluded. Snoozed threads appear only under "Threads" with their wake label.
- Eight rows, then "Show all in sidebar" (sets the inbox filter to this project).
- Empty (project has history but nothing recent): "No recent work. Start a thread below or open the Workbench."

### 3.5 Live now

Three compact groups, each hidden when empty, with a single "Nothing running" line when all are empty.

- **Agents:** threads in this checkout's project whose `session.status` is `starting`, `running` or `ready`, or whose `backgroundLiveness` is `working`. See [§8.1](#81-agents) for status words. A Task chip and worktree label are shown. Up to five, then "+3 more".
- **Services:** Dev Servers per [§8.2](#82-dev-servers). Actions: **Preview** (opens the Preview pane in the owning Workbench workspace, desktop) or **Open in browser** (web client), **Attach** for discovered servers, **Logs**.
- **Terminals:** count of open terminals for the project and how many have a running subprocess, from terminal metadata. "Open Workbench" link. Individual shells are listed in the Workbench, not here.

### 3.6 Branches summary (E4.3)

One strip: "4 worktrees · 1 has changes · 1 Task-owned · 1 missing" with **Open Branches**. Counts come from the worktree inventory. Hidden until E4.3.

### 3.7 Start new work

`ProjectLaunchBar` is a single-line field styled like the composer shell (22px radius, `--glow-focus` on focus), plus two quiet text buttons.

- **Enter / ↑** creates a draft in this project **on this checkout's root** through `useNewThreadHandler` (`envMode` from the project's `defaultThreadEnvMode`), writes the typed text into that draft through `composerDraftStore`, and navigates to the draft route. The real `ChatComposer` takes over; provider, model, access and worktree are chosen there. The bar shows the context it will use: `⎇ main · Codex gpt-5` (read-only text, from project defaults).
- **New Task** opens Command Deck with Task creation (`TaskCreateFields`) prefilled with the text.
- **Plan a Mission** opens Swarm `stage=brief` with the brief prefilled. Copy never says "run".
- The launch bar's ↑ button is the **one solid violet control** on Overview.
- Disabled with reason when no enabled provider passes E1 runtime readiness: "No provider is ready on This Mac. Fix in Provider Connections."

### 3.8 Empty project

Shown only when the project has no threads, Tasks or Missions. `EmptyProjectHero` (foundation Components §5.6): 40px mark, "What should we build in Halo Console?", one-line subtitle, static radial glow, four starter chips that prefill text only, the launch bar at 768px, and the three existing Launchpad mode cards as secondary entries (Workbench, Run a Swarm, Quick thread). The execution context block stays above the hero.

### 3.9 States

| State                       | Treatment                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                     | Header renders from the cached project immediately. Each card shows a skeleton at final size. After 10s: "Still loading {card}…" + Retry            |
| Partial failure             | The failing card shows an inline error with Retry; other cards render                                                                               |
| Not a Git repository        | Context block shows "Folder · not a Git repository". Branches is hidden from the sidebar list. New Task and Plan a Mission are disabled with reason |
| Environment offline         | Banner "devbox is offline. Work there is paused, not lost." Cached read data with "last updated" stamps. All actions disabled                       |
| Checkout ambiguous          | Never silent. The header names the resolved checkout and offers the switcher                                                                        |
| Project no longer available | Follow the successor key (E4.1). If none: "This project was removed or regrouped" + "All projects"                                                  |

### 3.10 Keyboard

- First Tab after the header lands on the first **Needs you** action. Needs you and Resume are lists: ↑/↓ move, Enter activates the row's primary action.
- `mod+n` still creates a new thread (now in the active checkout). `/` focuses the launch bar when focus is not in an input (proposed, conflict-check).
- Resume filter is a radio group (←/→).

## 4. Screen B — Branches & Worktrees

**Route:** `/projects/$projectKey/branches` (proposed). **Job:** one honest inventory of every checkout and branch in this repository on this environment, joined to the work that lives there, with safe ways to open, create and inspect.

### 4.1 Model: worktrees first, then branches

The inventory has two groups because they carry different facts:

- **Checkouts** (one row per Git worktree, the main checkout first): these have live status, processes, sessions and PR facts.
- **Branches without a checkout** (local refs, then remote refs on demand): these have only ref facts.

A branch that is checked out appears once, in Checkouts.

### 4.2 Layout (1440)

```
 Header: Halo Console ▾ · Branches        🖥 This Mac · …/Code/halo-console      Updated 12s ago [↻]
 ┌ [Search branches and worktrees…]  [All] [Has changes] [Task-owned] [Active]      [New branch…] [New worktree…] ┐
 │ CHECKOUTS · 4                                                                                                    │
 │ Branch                     Checkout                 HEAD     Changes   Sync     Owner              Activity    PR │
 │ ⎇ main            default  ● Current checkout       a1b2c3d  ●3 +1?    ↑1 ↓0    —                  ◉ 1 agent   —  │
 │ ⎇ nebula/manual/7f3a…      task-7f3a-payment-retry  9e8d7c6  ●12       local    Task · Payment retry ◉ Codex   —  │
 │ ⎇ feat/checkout-flow       checkout-flow            44f0e1a  clean     ↑4 ↓2    Thread · Checkout   ● web :5173 #41│
 │ ⎇ fix/sidebar-overflow     sidebar-fix  ⚠ missing   —        —         —        —                  —           —  │
 │ BRANCHES · 23                                                                                                    │
 │ ⎇ chore/deps-october                                 —        —         —        —                  committed 9d —  │
 │ ⎇ nebula/integration/b2…                             —        —         —        Integration · Batch 2  …        │
 │ Show remote branches (41)                                                                                        │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                              Row click → Worktree detail sheet (480px, right)
```

### 4.3 Columns and their sources

| Column   | Shows                                                                                                         | Source                                                                                                                              | Availability                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Branch   | name (mono, end-truncated), `default` and `remote` badges                                                     | `vcs.listRefs`                                                                                                                      | Now                                                                  |
| Checkout | "Current checkout" or worktree label (path on hover, start-truncated); `detached`, `missing`, `locked` badges | `VcsRef.worktreePath` now; full list incl. detached/missing from proposed `vcs.listWorktrees`                                       | Label now for branch worktrees; detached/missing/locked rows in E4.3 |
| HEAD     | 7-char SHA                                                                                                    | proposed `vcs.listWorktrees.head` (worktrees) and `vcs.listRefs` `headSha` (refs)                                                   | E4.3. Column hidden until then                                       |
| Changes  | `●n` changed files; `+n?` untracked when known; "clean"                                                       | `subscribeVcsStatus{cwd}` per checkout (`workingTree.files`); untracked count is a proposed additive field                          | Changed count now; untracked in E4.3, else omitted                   |
| Sync     | `↑n ↓n`, "local" when no upstream                                                                             | `aheadCount`, `behindCount`, `hasUpstream` per checkout                                                                             | Checkouts only. Never computed for refs without a checkout           |
| Owner    | Task (title), Integration batch, or Thread(s); Mission as a suffix                                            | Client join: `task.workspace.path/branch`; `IntegrationBatch.workspacePath/branch`; `thread.worktreePath/branch`; `Mission.taskIds` | Now                                                                  |
| Activity | agents (live), running processes, servers                                                                     | Thread `session.status`; `TerminalSummary.cwd/worktreePath/hasRunningSubprocess`; `DiscoveredLocalServer.terminal` → terminal cwd   | Now                                                                  |
| PR       | `#41` with state                                                                                              | `VcsStatusResult.pr` for that checkout's cwd                                                                                        | Checkouts only                                                       |
| Recent   | "committed 9d ago", or latest of thread/terminal activity                                                     | proposed `committedAt` on refs (already read server-side by `readGitRefsSnapshot`); thread `updatedAt`; terminal `updatedAt`        | Activity time now; commit time E4.3                                  |

Status subscriptions are opened only for checkouts (not refs), lazily for rows in view, and closed on unmount. Remote ref listing is on demand.

### 4.4 The ten interactions

| #   | Interaction                          | Where                                                  | Behavior                                                                                                                                                                                                                                                                                                                                                                 | Primitive                                                 |
| --- | ------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1   | Inspect branch                       | Row click / Enter                                      | Opens `WorktreeDetailSheet` (480px). Selection only; nothing mutates                                                                                                                                                                                                                                                                                                     | Read                                                      |
| 2   | Open an existing worktree            | Row action **Open**, sheet primary                     | Menu: **New thread here** (draft with `worktreePath`), **Open in Workbench** (last workspace for this checkout, else a new Shell pane rooted there), **Open in editor** (`OpenInPicker`)                                                                                                                                                                                 | `useNewThreadHandler`, Terminal Workspace, `OpenInPicker` |
| 3   | Create a worktree                    | **New worktree…**, branch row **Open in new worktree** | Dialog: branch (existing or new), base ref, "Start from origin" (existing switch), path preview from the server default. Creates, then offers the Open menu                                                                                                                                                                                                              | `vcs.createWorktree`                                      |
| 4   | Create a branch                      | **New branch…**                                        | Dialog: name and starting point. Creates the ref **without switching** (`switchRef: false`). Today `vcs.createRef` branches from the `cwd`'s HEAD, so the dialog shows "Starts at {checkout} · a1b2c3d"; choosing another base needs an additive `baseRefName` (E4.3) or uses **New worktree…** (which already accepts `baseRefName`). Follow-up: "Open in new worktree" | `vcs.createRef`                                           |
| 5   | Inspect associated agent work        | Sheet → Work                                           | Lists threads (status, provider, last activity) and the owning Task/Mission. **Open** goes to the thread or Task                                                                                                                                                                                                                                                         | Read                                                      |
| 6   | Open its Terminal Workspace          | Sheet → Work → Terminals, or row Open menu             | Opens the Workbench on the workspace that holds panes for this checkout; selects the pane without changing geometry. Task worktrees use `?taskId=`                                                                                                                                                                                                                       | Terminal Workspace routing                                |
| 7   | Inspect Git Diff                     | Sheet → **Open Diff**                                  | Task-owned: Task Diff (`orchestration.getTaskChanges`). Otherwise: Workbench Diff pane for that cwd (`review.getDiffPreview`)                                                                                                                                                                                                                                            | Existing diff renderers                                   |
| 8   | Open Preview when available          | Activity cell / sheet → Services                       | Shown only when a reachable server is linked to this checkout. Opens the Preview pane in the owning workspace. Web client: "Open in browser"                                                                                                                                                                                                                             | Preview, discovery                                        |
| 9   | Safely switch an idle checkout       | Sheet → **Switch checkout…** (secondary)               | Guarded flow (§5). Never offered on Task-owned or Integration worktrees                                                                                                                                                                                                                                                                                                  | E4.4 assessment                                           |
| 10  | Inspect worktree removal eligibility | Sheet → **Removal**                                    | Read-only eligibility (§5.6). Removal itself only through existing Task / Integration cleanup                                                                                                                                                                                                                                                                            | E4.4 assessment                                           |

**Selecting is not switching.** Clicking, focusing or arrowing through rows never calls `vcs.switchRef`. The only switch entry is the sheet's **Switch checkout…** button, which always runs the guard.

### 4.5 Filters and search

Search matches branch names and worktree labels (existing paginated `listRefs` query for refs; client filter for checkouts). Filters: **All**, **Has changes**, **Task-owned**, **Active** (agents or processes). There is no "Stale" filter in E4: age without commit time would be a guess, and the foundation rule "stale never next to delete" holds.

### 4.6 States

| State                | Treatment                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Loading              | Table skeleton: 4 checkout rows, 6 ref rows at final height                                                             |
| Not a Git repository | Empty state "This project isn't a Git repository" (no "Initialize" action here)                                         |
| No primary remote    | Sync and PR columns show "local" / "—" with tooltip "No remote configured"                                              |
| Detached HEAD        | Row label `detached @ a1b2c3d` (E4.3), warning tone. Sheet offers "Create branch here…" (`vcs.createRef` from that SHA) |
| Missing worktree     | Error badge "missing". Task-owned: link to the Task's existing restore path. Others: "Recorded path no longer exists"   |
| Stale data           | "Updated 3m ago" + Refresh (`refresh: true` on `listRefs`, `vcs.refreshStatus` per checkout)                            |
| Environment offline  | Cached inventory, read-only, banner                                                                                     |
| Changed since render | Changed cells highlight once with `accentSurface` (600ms), never animate on refresh otherwise                           |

## 5. Worktree safety and the guarded switch

### 5.1 Three different verbs

| Verb                | Meaning                                                                                           | Mutates?                                                       | Guard       |
| ------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------- |
| **Select**          | Focus a branch or checkout row; open its detail                                                   | No                                                             | None        |
| **Open**            | Start or resume work in a checkout that already holds the branch, or create a new worktree for it | Creates a worktree at most; never changes an existing checkout | None needed |
| **Switch checkout** | Change which branch an existing mutable checkout has checked out                                  | Yes (`git checkout` in that cwd)                               | Always      |

The UI uses these words exactly. "Open in a new worktree" is always the preferred path and the primary button whenever switching is blocked.

### 5.2 Decision sequence

```
Switch checkout… (sheet) on checkout C, target branch X
  │
  ├─ X is already checked out in worktree W ─────────► "X is open in W."  Primary: Open W.  No switch offered.
  ├─ C is Task-owned or an Integration worktree ─────► Blocked (policy). Primary: Open X in a new worktree. Link: Open Task.
  ├─ C's environment is offline ──────────────────────► Blocked. Retry when connected.
  │
  └─ Fresh server assessment of C (vcs.assessCheckoutSwitch)
        │
        ├─ any blocker ──► Blocked dialog: each blocker with evidence and its own link.
        │                  Primary: Open X in a new worktree.  Secondary: Re-check.  No "Switch anyway".
        │
        └─ clear ───────► Confirm dialog: "Switch {C label} on {environment} from A to X"
                          + path + notices (e.g. unpublished commits stay on A)
                          [Cancel] [Switch checkout]  (not the default button; Enter does not submit)
                                 │
                                 └─ server revalidates with the assessment token
                                       ├─ still clear ─► switched. Toast "Switched … to X · 9e8d7c6"
                                       └─ changed ────► back to Blocked with the new evidence
```

### 5.3 Blockers

All are computed **server-side at assessment time** and re-checked at execution. The client never decides safety.

| Code                      | Blocks?         | Evidence shown                                                          | Link                | Copy                                                                  |
| ------------------------- | --------------- | ----------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| `task-owned`              | Yes             | Task title, status                                                      | Open Task           | "Task worktrees keep their branch. Open X in a new worktree instead." |
| `integration-owned`       | Yes             | Batch title, status                                                     | Open Integration    | "Integration worktrees are managed by their batch."                   |
| `target-checked-out`      | Redirect        | Worktree label and path                                                 | Open {W}            | "X is already open in {W}."                                           |
| `active-session`          | Yes             | Thread title, provider, session status (`starting`, `running`, `ready`) | Open thread         | "Codex is working here. Stop or finish the turn in its thread first." |
| `running-process`         | Yes             | Terminal label, `hasRunningSubprocess`                                  | Open in Workbench   | "A process is running in this checkout: pnpm dev."                    |
| `dev-server`              | Yes             | Server name, URL, ownership                                             | Open Workbench pane | "web is serving from this checkout on :5173."                         |
| `uncommitted-changes`     | Yes             | Changed file count, first three paths                                   | Open Diff           | "12 files have uncommitted changes."                                  |
| `untracked-files`         | Yes             | Untracked count, first three paths                                      | Open Diff           | "3 untracked files could be overwritten or carried over."             |
| `detached-head`           | Yes             | HEAD SHA                                                                | Create branch here… | "Commits made here aren't on a branch yet."                           |
| `operation-in-progress`   | Yes             | merge / rebase / cherry-pick / bisect in progress                       | Open in Workbench   | "A rebase is in progress in this checkout."                           |
| `environment-unavailable` | Yes             | Environment label, last seen                                            | —                   | "devbox is offline."                                                  |
| `unpublished-commits`     | **No** (notice) | Ahead count, upstream state                                             | —                   | "2 commits on A aren't on a remote. They stay on A after the switch." |
| `assessment-stale`        | Yes             | Age                                                                     | Re-check            | "These results are more than 30 seconds old."                         |

Never offered, anywhere: stash, force checkout, discard, clean, kill/stop processes from the dialog, stop sessions from the dialog, or changing a Task's branch.

### 5.4 Dialog anatomy

- Title states the verb and the target: "Switch Current checkout to feat/checkout-flow?" / "Can't switch Current checkout yet".
- Context block (always): environment icon + label, checkout label, start-truncated path, `A → X` in mono.
- Blocked: list of blocker rows (icon + label + evidence + link), each a separate focusable row. Live region announces the blocker count.
- Footer order: **Open X in a new worktree** (primary, violet) · Re-check (secondary) · Cancel (ghost). Clear state: Cancel · **Switch checkout** (primary, but not auto-focused; initial focus on Cancel).
- Progress: the switch button shows a spinner and the dialog is non-dismissable only for the duration of the server call.

### 5.5 Retrofitting the existing branch picker (E4.4, decision **P5**)

`BranchToolbarBranchSelector` keeps its current behavior for **drafts** that do not yet own a session. For a server thread, choosing a different branch in the composer strip opens the same guard sheet instead of calling `vcs.switchRef` directly. Choosing a branch that lives in another worktree keeps today's "reuse existing worktree" path but stops calling `stopSession` silently: it becomes "Start a new thread in {W}" (selecting is not retargeting, foundation §5.3 rule 3).

### 5.6 Worktree removal eligibility (separate, high consequence)

E4 shows eligibility; it does not add a generic remove action (decision **P6**).

- Sheet section **Removal** with a **Check eligibility** button. Results are fetched fresh (`vcs.assessWorktreeRemoval`) and expire after 30 seconds.
- Results: **Eligible through Task cleanup** (terminal Task, clean worktree; links to the existing "Remove workspace" in the Task inspector) · **Eligible through Integration cleanup** · **Not eligible** with reasons (main checkout, uncommitted or untracked files, unpublished commits, active session, running process or server, non-terminal Task, locked) · **Not managed by Nebula** ("Removal of unmanaged worktrees isn't available in Nebula yet. Use Git directly if you intend to remove it.").
- No delete button sits next to any age or "stale" label.
- The existing thread-deletion prompt ("Delete the worktree too?") keeps working but is listed as a follow-up: it calls `vcs.removeWorktree` with `force: true`. A later removal workflow should route it through the same assessment.

## 6. Screen C — Project Workspaces (Workbench)

**Route:** `/projects/$projectKey/terminal-center` (label **Workbench**). **Job:** move between live project workspaces fast, and always know what each pane is attached to.

### 6.1 Concepts the UI must keep apart

| Concept                             | What it is in Nebula                                                                             | How it is drawn                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Workspace**                       | A named Terminal Workspace: UI composition of panes for one project checkout. Not a Git worktree | Workspace switcher in the Workbench header: name, pane count, live counts                                                       |
| **Same Chat Thread, another view**  | One canonical Thread shown in the chat route and in a Workbench chat pane                        | Pane sub-label "Same conversation as Chat" + `Link2` glyph. Opening either shows the same transcript                            |
| **Separate provider CLI terminal**  | A provider CLI process in a PTY: a new provider session in the same worktree                     | Title "{Provider} CLI", sub-label "Separate session, not linked to this chat". Link glyph only means "shown together"           |
| **Separate worktree**               | A different Git checkout                                                                         | Worktree chip in mono in every pane header; panes in different worktrees never share a chip                                     |
| **Separate Task**                   | A canonical Task with its own worktree, ownership and review                                     | Task chip "Task · Payment retry" with status; Task-bound panes open the Task inspector                                          |
| **Different execution environment** | A different Nebula server (devbox, WSL)                                                          | Cloud icon + environment label in the pane header and the workspace switcher. Remote localhost is labelled "devbox's localhost" |

### 6.2 Workbench header

```
 Halo Console ▾ · Workbench   [Default ▾]   🖥 This Mac · ⎇ main · Current checkout     [Workbench|Preview|Build+Preview] [Layout ▾] [+ New Pane]
```

- **Workspace switcher** (`[Default ▾]`): lists this checkout's workspaces with pane counts and live badges (agents working, servers running), "New Workspace", and "Hidden panes (2)". Keyboard: `mod+alt+t` is taken by tabs; switching has no default key (palette: "Switch workspace").
- The context chip names the checkout the workspace is rooted in; Task-bound panes carry their own chips.
- The existing mode and layout controls are unchanged.

### 6.3 Pane identity header (shared)

`PaneIdentityHeader` (foundation Components §4.3), 28px: kind icon · title · scope chips (environment when not primary · worktree · Task) · relation badge · actions (**Hide**, kind-specific actions, overflow).

| Pane kind         | Title                    | Relation badge                   | Stop available?                                                  |
| ----------------- | ------------------------ | -------------------------------- | ---------------------------------------------------------------- |
| Chat (thread)     | Thread title             | "Same conversation as Chat"      | Stop turn only while a turn runs (existing)                      |
| Provider CLI      | "Codex CLI"              | "Separate session"               | Close terminal (ends the CLI), confirm when running              |
| Shell             | "Shell" or label         | —                                | Close terminal (ends shell), confirm when `hasRunningSubprocess` |
| Dev Server        | profile name             | "Started by Nebula" / "Attached" | Stop only when Started by Nebula                                 |
| Preview           | host                     | "From web · :5173"               | No process to stop                                               |
| Diff / Git / File | "Changes" / "Git" / file | scope "Task" / "Checkout"        | —                                                                |

### 6.4 Open fast, return later

- From **Overview**: "Workbench" header button opens the last workspace for the active checkout. Live now rows open the owning workspace and select the pane.
- From **Branches**: "Open in Workbench" picks the workspace that already has panes rooted in that checkout; otherwise the last workspace with a new Shell pane added for that worktree (never a new workspace silently).
- From a **Task**: existing `?taskId=` behavior.
- From the **sidebar**: Workbench sub-row shows a live count; hover reveals the workspace list.
- Return: last workspace per scoped checkout is persisted (existing behavior, re-keyed per §2.2).

### 6.5 Closing never ends unrelated work

- Workbench panes keep **Hide** (`hideWorkspacePane`) as the default close. Hidden panes are listed and restorable.
- Stopping a process is a separate menu item with a confirmation that names the process and the checkout.
- **Finding:** the chat right-panel terminal tab's close button calls `terminal.close` with `deleteHistory: true` (`ChatView.tsx`), which ends the shell. E4.2 relabels it "Close and end shell" and confirms when `hasRunningSubprocess` is true, so the chat surface and the Workbench speak the same language. Closing a Preview never stops its Dev Server.

## 7. Screen D — Project navigation sidebar

Extend `Sidebar.tsx` (default sidebar). No third sidebar. `LegacySidebar.tsx` is untouched.

### 7.1 Anatomy (top to bottom)

1. Brand header (existing `SidebarChromeHeader`).
2. Search + `⌘K` hint (existing; hint from `shortcutLabelForCommand`).
3. New thread (existing).
4. **Swarm** status button and **Terminal Center** (existing global destinations).
5. **Projects** section label with a "New project" icon button (moved from the scope menu).
6. Project rows (32px). The **active project** is expanded:
   - checkout line (24px, `type-meta`): `🖥 This Mac · ⎇ main` or `☁ devbox · ⎇ main`; it opens the checkout switcher when there are several checkouts;
   - sub-rows (28px, 28px indent): **Overview**, **Workbench** (live count), **Tasks** (attention count), **Branches** (hidden until E4.3), **Notes** (hidden until backend), **Settings**.
7. Other projects: collapsed rows only. Up to five by last activity (or manual order when set), then **All projects…** (opens the palette's project switcher).
8. **Threads** inbox (existing) with a "This project / All" filter replacing the scope menu.
9. Provider entry (**E3** `ProviderConnectionEntry`).
10. Footer (existing).

### 7.2 Project row

| Element           | Rule                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Chevron           | Separate button. Expands or collapses without navigating                                                                                    |
| Favicon + name    | Link to Overview. Activating it makes the project active                                                                                    |
| Environment glyph | Cloud for `remote-only`, split glyph for `mixed`, none for `local-only`. Tooltip names the environments                                     |
| Attention badge   | Count of Needs you items in decision classes 1–2 only (approvals, input, checkpoints, failures). `type-micro`, `warningSurface`             |
| Live dot          | One duty-cycled dot when any agent in the project is working. Static dot under reduced motion                                               |
| Selected          | `sidebarRowSelected` + 2px leading `primary` bar on the current sub-row only; the project row of the active project uses `sidebarRowActive` |

### 7.3 Hover and focus disclosure

Hovering (300ms intent delay) or focusing a **collapsed** project row and pressing → opens a 280px popover: checkouts with environment and branch, live counts (agents, servers), top two Needs you items, and links (Overview, Workbench, Tasks). The popover never shifts layout and never opens on scroll. It closes on Escape, pointer leave (150ms grace) or blur.

### 7.4 Keyboard

- The Projects section is a list of disclosure groups: ↑/↓ move between rows, → expands, ← collapses, Enter navigates, Space toggles the disclosure.
- `aria-current="page"` on the current sub-row; each sub-list is a `group` labelled by the project name.
- Proposed palette commands (no default keys until conflict-checked): `project.home`, `project.workbench`, `project.tasks`, `project.branches`, `project.switch`, `project.switchCheckout`. `thread.jump.*` hints keep rendering on thread rows.

### 7.5 Collapse

- Sidebar collapse is the existing offcanvas (`mod+b`); there is no icon rail.
- Collapsed projects persist (`projectExpandedById` exists). The active project cannot be collapsed below its checkout line while it is the current route's project; its sub-list can be hidden with the chevron and shows a "6 destinations" hint.

## 8. Running agents and services

### 8.1 Agents

Only canonical threads produce agent rows. A provider instance, a saved role or an Architect team role never produces a live row.

| Condition (thread shell)                                   | Status words            | Tone    | Live dot |
| ---------------------------------------------------------- | ----------------------- | ------- | -------- |
| `hasPendingApprovals`                                      | "Approval needed"       | warning | static   |
| `hasPendingUserInput`                                      | "Waiting for you"       | warning | static   |
| `latestTurn.state = running` or `session.status = running` | "Working · 4m"          | info    | pulse    |
| `session.status = starting`                                | "Starting"              | info    | pulse    |
| `backgroundLiveness = monitoring`                          | "Monitoring"            | info    | static   |
| `session.status = ready`, no running turn                  | "Idle · session open"   | neutral | none     |
| `session.status = interrupted`                             | "Interrupted"           | warning | none     |
| `session.status = error`                                   | "Stopped with an error" | error   | none     |
| `stopped` / `idle` / no session                            | not listed in Live now  | —       | —        |

Row: provider mark (from `ProviderInstanceIcon`) · title · status words · Task chip · worktree label · last activity. Native subagents stay in `AgentsPanel`.

### 8.2 Dev servers

Ownership is derived from facts Nebula has. Nothing claims lifecycle ownership it does not hold.

| Class             | Evidence                                                                                                 | Badge                    | Actions                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------- |
| Started by Nebula | A `DevServerProfile` whose terminal `dev-server-<id>` is running, and discovery links the listener to it | "Started by Nebula"      | Preview, Logs, Restart, **Stop** (confirm)        |
| Attached          | A workspace pane with `externalServer` for that host and port                                            | "Attached · external"    | Preview, Open in browser, **Detach** (panes only) |
| Discovered        | `DiscoveredLocalServer` with `terminal: null`, not attached                                              | "Discovered"             | Attach & Preview                                  |
| Nebula terminal   | Discovered listener whose `terminal` is a Nebula terminal but not a profile                              | "From a Nebula terminal" | Preview, Open terminal                            |
| Stopped           | Profile exists, terminal not running                                                                     | "Stopped"                | Start (opens the existing approval-aware flow)    |
| Unavailable       | Was reachable, now not listening, or environment offline                                                 | "Not reachable"          | Retry discovery                                   |

Remote servers carry "on devbox" and their links say "devbox's localhost". Closing a Preview never stops a server.

## 9. Notes integration boundary

Notes ship only after their separately authorized backend (revisioned persistence and authorization). Until then, nothing below renders in the product.

| Placement                | Future behavior                                                                                        | Before the backend              |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Sidebar sub-row          | "Notes" between Branches and Settings, with a pinned count                                             | Hidden. No disabled placeholder |
| Overview                 | "Pinned notes" card in the right column under Live now (three titles, revision, updated time)          | Hidden. No empty card           |
| Route                    | `/projects/$key/notes` (foundation Screens §5)                                                         | Not registered                  |
| Composer                 | `@Notes` in the attach menu (D7), pins a revision chip                                                 | Not offered                     |
| Project context relation | Notes are project-scoped (or environment-global), never stored in a worktree path, never auto-attached | —                               |

Notes are not Mission memory. Mission context packages stay as they are; a Note reaches an agent only by explicit attachment of a specific revision. The visual reference shows these placements in a clearly labelled **future** frame only.

## 10. Responsive

| Width | Shell                                                                                                      | Overview                                                                                       | Branches                                                                                            | Workbench                                            |
| ----- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 390   | Sidebar is a sheet. Header shows project ▾ and a horizontally scrolling destination bar (the only tab row) | One column: context block (wraps), Needs you, Resume, Live now; launch bar docks to the bottom | Two-line rows: branch + status, then checkout + owner. Filters in a menu. Detail is full-screen     | One pane at a time; panes open as full-height sheets |
| 768   | Sidebar visible (collapsible), 232px                                                                       | One column, Resume and Live now stacked                                                        | Two-line rows                                                                                       | Existing compact layout                              |
| 980   | Sidebar 256                                                                                                | One column; Live now beside Needs you when Needs you has ≤2 rows                               | Table with Branch, Checkout, Changes, Owner, Activity; HEAD/Sync/PR move into the row's second line | Context panel becomes a sheet (existing ≤980 rule)   |
| 1280  | Full shell                                                                                                 | Two columns (Resume · Live now)                                                                | Full table; detail sheet overlays                                                                   | Docked panels                                        |
| 1440  | Reference size                                                                                             | Two columns, content 1152 max                                                                  | Full table; detail sheet overlays the table with a scrim                                            | Reference                                            |
| 1920  | —                                                                                                          | Two columns; Needs you and Branches summary span                                               | Table + docked sheet                                                                                | Context panel open by default                        |
| 2560  | —                                                                                                          | Content capped at 1152px; no stretching                                                        | Table capped at 1600px; sheet docked                                                                | Optional split main area (existing split model)      |

At 200% text zoom every layout stays single-axis scrolling; chips wrap; no control is clipped. No page-level horizontal overflow at any width.

## 11. Visual design

- **Palette:** follow the foundation tokens. The reference renders both **Nebula Ion** (proposed, D1) and the **shipped `nebula` theme** (today's default). Implementation uses theme roles only, so E4 looks correct in whichever theme the user runs. E4 does not change the default theme.
- **One violet per region:** the launch bar's send button on Overview; **Open in a new worktree** in the guard dialog; the active sub-row bar in the sidebar is a 2px accent, not a control.
- **Status semantics:** attention = warning; working = info (with the live dot); failure = error; ready/clean = success used sparingly (never for "idle"); unknown = `iconMuted`. Ownership chips (Task, Integration, Thread) are neutral text chips with icons, not colored.
- **Mono:** branches, SHAs, paths, ports, model slugs. Paths start-truncated, titles end-truncated.
- **Density:** 44px Resume and Needs you rows, 40px table rows, 32px sidebar rows. Content max 1152px on Overview.
- **Glow:** focus and active only (`--glow-focus`, `--glow-active`). The static hero glow appears only on an empty project.
- **Motion:** sheet 220ms, popover 160ms, row highlight once 600ms. Nothing animates at idle except genuinely live dots. Reduced motion: no transforms, crossfade ≤80ms, static dots plus text.

## 12. Accessibility checklist

- [ ] Every interactive element has a visible ion focus ring (`--ring`), including table rows, sub-rows, chips and popover links.
- [ ] Skip link "Skip to main content" is the first focusable element.
- [ ] Tab order: header → Needs you → Resume filter → Resume list → Live now → Branches summary → launch bar.
- [ ] Sidebar Projects section: disclosure buttons with `aria-expanded`; sub-lists are `role="group"` with `aria-labelledby` the project name; `aria-current="page"` on the current destination.
- [ ] Branches table is `role="grid"` with row and column headers; ↑/↓ moves rows; Enter opens detail; actions reachable with Tab inside the row.
- [ ] Status is always icon + text. Live dots have text equivalents ("Working").
- [ ] Badges carry accessible names: "3 items need you", "2 agents working".
- [ ] Guard dialog: focus trapped; initial focus on Cancel (clear state) or on the first blocker link (blocked state); Enter never confirms a switch; Escape cancels and returns focus to **Switch checkout…**.
- [ ] Live regions: Needs you count changes (polite), assessment result (polite), switch result (polite), switch failure (assertive).
- [ ] Hover popovers open on focus too and are dismissable with Escape; no information exists only on hover.
- [ ] Reduced motion honored (`prefers-reduced-motion`, `.no-transitions`).
- [ ] Contrast AA in both themes for both palettes (Ion audited in foundation §3.1; shipped theme is today's baseline).
- [ ] 200% text scaling: no clipped text, no horizontal page scroll; table switches to two-line rows.
- [ ] Touch (`pointer: coarse`): 44px targets.
- [ ] Screen reader labels for every icon button: "Expand Halo Console", "Open feat/checkout-flow in a new worktree", "Hide Codex CLI pane".
- [ ] Remote context is announced: "Current checkout on devbox".

## 13. Founder decisions

| ID  | Decision                                  | Recommendation                                                                                                                   | If declined                                                                       |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P1  | One project navigation                    | Sidebar active-project list is the only project nav at ≥768px. No in-page tab row (supersedes foundation §4.4)                   | Keep the foundation tab row; sidebar and tabs duplicate destinations              |
| P2  | Name of the project Terminal Center       | Label it **Workbench** in project navigation; keep the route path and the global "Terminal Center" label                         | Keep "Terminal Center" in both places; Workbench stays a design-doc term          |
| P3  | Environment-scoped project URLs           | `checkout` search parameter on every project route; visible checkout and switcher; re-key Terminal Workspace state by scoped ref | Pages keep silently using the primary member; cross-environment ambiguity remains |
| P4  | Files                                     | An action (`mod+p`, Workbench file pane), not a destination, in E4                                                               | Add a Files route later with its own design                                       |
| P5  | Guard the existing composer branch picker | For server threads, route branch changes through the switch guard; stop the silent `stopSession` on worktree reuse               | Branches screen is safe but the composer path can still change an active checkout |
| P6  | Generic worktree removal                  | Eligibility only in E4; removal stays in Task and Integration cleanup                                                            | Design a separate removal workflow before E4.4                                    |
| P7  | Unpublished commits                       | Informational notice in the confirm dialog, not a blocker (commits stay on their branch)                                         | Treat as a blocker; more "Open in new worktree" detours                           |
| P8  | Active project persistence                | Persist the last active project and checkout per client                                                                          | Active project follows only the route; global pages lose project context          |
| P9  | Default keys for project commands         | Ship palette commands without default keys; propose keys after a conflict check                                                  | Assign keys now and risk collisions with `mod+1…9`, `mod+shift+[ ]`               |
| P10 | Live sidebar badge scope                  | Badge counts decision classes 1–2 only                                                                                           | Count every attention item; badges become noisy                                   |

Founder decisions F1–F16 in the foundation contract are unchanged. F1 (Ion palette and default) still gates any default theme change.
