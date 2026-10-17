# Project OS V2 engineering handoff (E4)

**Status:** Proposed (D4). Design authority for E4.1–E4.4. Codex owns implementation choices inside these boundaries.

Read [PROJECT_OS_DESIGN.md](PROJECT_OS_DESIGN.md) first. Code paths resolve at `main` `784473fb5` unless marked **E3** (`131085ff8`). Every "proposed" name below is a design name for something that does not exist yet; Codex may rename it, but must keep its contract.

## 1. Component and reuse map

### 1.1 Existing (reuse as is)

| Need                                                           | Component / module                                                                                                          | Path                                                                                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shell, resizable offcanvas sidebar                             | `AppSidebarLayout`, `ui/sidebar`                                                                                            | `apps/web/src/components/AppSidebarLayout.tsx`, `apps/web/src/components/ui/sidebar.tsx`                                                                           |
| Project grouping and keys                                      | `derivePhysicalProjectKey`, `deriveLogicalProjectKey`, `buildProjectGroups`                                                 | `packages/client-runtime/src/state/projectGrouping.ts` (re-exported by `apps/web/src/logicalProject.ts`)                                                           |
| Sidebar project snapshots                                      | `buildSidebarProjectSnapshots` (`environmentPresence`, `remoteEnvironmentLabels`)                                           | `apps/web/src/sidebarProjectGrouping.ts`                                                                                                                           |
| Environments and connection state                              | `useEnvironments`, `usePrimaryEnvironmentId`, `useEnvironmentConnectionState`                                               | `apps/web/src/state/environments.ts`                                                                                                                               |
| Shell snapshot (threads, tasks, missions, runs, project shell) | `environmentSnapshotAtom`; `taskEnvironment`; `environmentThreadShells`                                                     | `apps/web/src/state/shell.ts`, `apps/web/src/state/tasks.ts`, `apps/web/src/state/threads.ts`                                                                      |
| Thread status vocabulary                                       | `resolveThreadStatusPill`, `resolveSidebarThreadStatus`, `ThreadStatusIndicators`                                           | `apps/web/src/components/Sidebar.logic.ts`, `apps/web/src/components/ThreadStatusIndicators.tsx`                                                                   |
| Task attention                                                 | `deriveTaskAttention`, `deriveTaskPresentationStatus`                                                                       | `apps/web/src/components/commandDeck/commandDeckLogic.ts`                                                                                                          |
| Mission attention                                              | `missionAttentionItems`                                                                                                     | `apps/web/src/components/commandDeck/missionCommandCenterViewModel.ts`                                                                                             |
| Provider readiness                                             | `deriveProviderReadiness` (E1), `useProviderReadiness`                                                                      | `packages/shared/src/providerReadiness.ts`, `apps/web/src/components/settings/useProviderReadiness.ts`                                                             |
| Provider Connections sheet entry                               | `ProviderConnectionEntry`, `parseProviderConnectionsSearch` (**E3**)                                                        | `apps/web/src/components/providerConnections/ProviderConnectionEntry.tsx`, `apps/web/src/components/providerConnections/providerConnectionsSearch.ts`              |
| New thread / draft                                             | `useNewThreadHandler` (`branch`, `worktreePath`, `envMode`, `startFromOrigin`), `composerDraftStore`                        | `apps/web/src/hooks/useHandleNewThread.ts`, `apps/web/src/composerDraftStore.ts`                                                                                   |
| Task creation                                                  | `TaskCreateFields`, `taskEnvironment.create`                                                                                | `apps/web/src/components/ProjectTasksSection.tsx`                                                                                                                  |
| Branch and worktree pickers                                    | `BranchToolbar`, `BranchToolbarBranchSelector`, `BranchToolbarEnvModeSelector`, `BranchToolbarEnvironmentSelector`          | `apps/web/src/components/BranchToolbar*.tsx`                                                                                                                       |
| Git actions, PR dialog                                         | `GitActionsControl`, `PullRequestThreadDialog`                                                                              | `apps/web/src/components/GitActionsControl.tsx`, `apps/web/src/components/PullRequestThreadDialog.tsx`                                                             |
| Terminal Workspace model                                       | `terminalWorkspace.ts` (`TerminalWorkspace`, panes, modes, presets), `hideWorkspacePane`, `restoreWorkspacePane`            | `apps/web/src/components/terminalCenter/terminalWorkspace.ts`, `apps/web/src/components/terminalCenter/ProjectTerminalWorkspace.tsx`                               |
| Task inspector                                                 | `TaskInspector`                                                                                                             | `apps/web/src/components/terminalCenter/TaskInspector.tsx`                                                                                                         |
| Dev servers                                                    | `DevServerControls`, `discoverDevServerSuggestions`, `useDiscoveredLocalServers`, `resolveTerminalWorkspaceProjectServices` | `apps/web/src/components/terminalCenter/DevServerControls.tsx`, `apps/web/src/components/terminalCenter/devServerDiscovery.ts`, `apps/web/src/components/preview/` |
| Diff                                                           | `DiffPanel`, `TaskChangesPanel`, `RepositoryDiffPane` (internal to the workspace file)                                      | `apps/web/src/components/DiffPanel.tsx`, `apps/web/src/components/ProjectTasksSection.tsx`, `apps/web/src/components/terminalCenter/ProjectTerminalWorkspace.tsx`  |
| Open in editor                                                 | `OpenInPicker`                                                                                                              | `apps/web/src/components/chat/OpenInPicker.tsx`                                                                                                                    |
| Command palette                                                | `CommandPalette`, `CommandPalette.logic.ts` `buildRootGroups`, `commandPaletteBus`                                          | `apps/web/src/components/CommandPalette*.ts(x)`, `apps/web/src/commandPaletteBus.ts`                                                                               |
| Keybindings                                                    | `DEFAULT_KEYBINDINGS`; command ids                                                                                          | `packages/shared/src/keybindings.ts`, `packages/contracts/src/keybindings.ts`                                                                                      |
| Primitives                                                     | `ui/*` (button, badge, dialog, sheet, popover, menu, tooltip, kbd, skeleton, empty, toggle-group, scroll-area)              | `apps/web/src/components/ui/`                                                                                                                                      |

### 1.2 Extend

| Component                                 | Extension                                                                                                                                                    | Slice |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `Sidebar.tsx`                             | Projects section with active-project disclosure, checkout line, destination sub-rows, collapsed rows, hover/focus popover, "This project / All" inbox filter | E4.1  |
| `ProjectLaunchpad.tsx`                    | Becomes Overview: header context block, Needs you, Resume, Live now, Branches summary, launch bar, empty hero                                                | E4.2  |
| Project route files                       | `validateSearch` accepts `checkout`; successor-key lookup; header shows resolved checkout                                                                    | E4.1  |
| `projects.$projectKey_.command-deck.tsx`  | `validateSearch` keeps `selectedTask` (and a proposed `section=integration`) outside `mode=swarm`                                                            | E4.2  |
| `uiStateStore.ts`                         | Persist active project + checkout; re-key `terminalWorkspacesByProjectId` and `terminalCenterByProjectId` by scoped ref with read-time migration             | E4.1  |
| `ProjectTerminalWorkspace.tsx`            | Workspace switcher popover in the header (data already in `TerminalWorkspaceProjectState`); "Workbench" label                                                | E4.1  |
| `ChatView.tsx` right-panel terminal close | Relabel "Close and end shell"; confirm when `hasRunningSubprocess`                                                                                           | E4.2  |
| `CommandPalette.logic.ts`                 | "Go to" group: Overview, Workbench, Tasks, Branches, Switch project, Switch checkout, Switch workspace                                                       | E4.1  |
| `BranchToolbarBranchSelector.tsx`         | Server threads route branch changes through the guard; remove silent `stopSession` on worktree reuse                                                         | E4.4  |
| `GitVcsDriverCore.ts` `listRefs` / status | Additive `headSha`, `committedAt` on refs; additive `untrackedCount` on working tree                                                                         | E4.3  |

### 1.3 Proposed (new presentation components; none owns execution state)

| Component                                    | Purpose                                                             | Slice                                           |
| -------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| `SidebarProjectSection`                      | Projects list, active disclosure, collapsed rows                    | E4.1                                            |
| `SidebarProjectPopover`                      | Hover/focus summary for a collapsed project                         | E4.1                                            |
| `ProjectCheckoutSwitcher`                    | Lists logical-project members with environment and connection state | E4.1                                            |
| `ProjectContextBlock`                        | Overview header: project, checkout, branch, worktree, Git status    | E4.2                                            |
| `ProjectAttentionList`                       | Needs you rows                                                      | E4.2                                            |
| `ProjectResumeList`                          | Threads, Tasks, Missions with a filter                              | E4.2                                            |
| `ProjectLiveNow`                             | Agents, services, terminal counts                                   | E4.2                                            |
| `ProjectLaunchBar`                           | Hands text to a draft, Task create or Swarm brief                   | E4.2                                            |
| `BranchInventory`                            | Checkouts and branches table/grid                                   | E4.3                                            |
| `WorktreeDetailSheet`                        | Detail, work, services, actions, removal eligibility                | E4.3 (E4.4 adds switch and removal sections)    |
| `CreateWorktreeDialog`, `CreateBranchDialog` | Thin dialogs over existing RPCs                                     | E4.3                                            |
| `SwitchGuardDialog`                          | Assessment, blockers, confirm, revalidate                           | E4.4                                            |
| `RemovalEligibilityPanel`                    | Fresh read-only eligibility                                         | E4.4                                            |
| `PaneIdentityHeader`                         | Shared pane identity labels (foundation Components §4.3)            | Optional in E4.1; required before E4.4 sign-off |

### 1.4 Pure modules (table-driven tests required)

| Module (proposed)          | Inputs                                                                           | Output                                 |
| -------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| `resolveProjectCheckout`   | project groups, `checkout` param, persisted last checkout, environments          | `{ member, isExplicit, alternatives }` |
| `deriveProjectAttention`   | environment snapshot, project shell, provider snapshots, project ref             | ordered `ProjectAttentionItem[]`       |
| `deriveProjectResume`      | threads, tasks, missions, runs, filter                                           | ordered rows                           |
| `deriveAgentPresence`      | thread shells                                                                    | rows with status words and tone (§8.1) |
| `deriveDevServerOwnership` | profiles, terminal metadata, discovered servers, workspace panes                 | rows with ownership class (§8.2)       |
| `joinWorktreeInventory`    | worktrees, refs, statuses, threads, tasks, missions, batches, terminals, servers | inventory rows with owner and activity |

Each derivation lives outside components (same pattern as E3's `providerConnectionStatus.ts`). Components render its output only.

## 2. Canonical data dependencies

### 2.1 Facts and sources

| Fact                           | Canonical source                                                                                                  | Consumer                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Project, members, environments | Project shell + `projectGrouping.ts`; `state/environments.ts`                                                     | Sidebar, all project routes             |
| Thread status and placement    | `OrchestrationThreadShell` (`session`, `latestTurn`, `hasPending*`, `branch`, `worktreePath`, `updatedAt`)        | Overview, Branches, Live now            |
| Task and workspace             | `OrchestrationTask` (`status`, `workspace`, `reviews`, `threadId`)                                                | Overview, Branches                      |
| Mission and run                | `Mission` (`taskIds`, `checkpoints`), `MissionRun` (`status`, `attention`)                                        | Overview                                |
| Integration                    | `OrchestrationProjectShell.integrationBatches`                                                                    | Overview, Branches                      |
| Architect plans                | `OrchestrationProjectShell.architectPlans`                                                                        | Overview                                |
| Provider readiness             | `ServerProvider` + `deriveProviderReadiness`; **E3** connection status                                            | Overview, launch bar                    |
| Checkout Git status            | `subscribeVcsStatus{cwd}` / `vcs.refreshStatus`                                                                   | Overview context, Branches              |
| Refs                           | `vcs.listRefs`                                                                                                    | Branches                                |
| Terminals                      | `subscribeTerminalMetadata` (`TerminalSummary.cwd`, `worktreePath`, `hasRunningSubprocess`, `label`, `updatedAt`) | Live now, Branches, guard (server side) |
| Servers                        | `subscribeDiscoveredLocalServers` (`terminal` link); `DevServerProfile` in settings                               | Live now, Branches                      |
| Workspaces                     | `uiStateStore.terminalWorkspacesByProjectId` (client-only)                                                        | Workbench switcher, sidebar count       |

### 2.2 Client-side composition (no new server query)

E4.1 and E4.2 need **no** server change except the Command Deck search parameter. `deriveProjectAttention` reads the snapshot for the active checkout's environment only. It must not query other environments for a remote member unless that member is the selected checkout.

### 2.3 Required server additions

Inventory fields are additive; guarded mutation behavior is an intentional compatibility change in E4.4. Authorization is registered in `apps/server/src/auth/RpcAuthorization.ts`; schemas in `packages/contracts/src/git.ts` and `rpc.ts`; handlers in `apps/server/src/ws.ts` through `GitWorkflowService`.

| Proposed method / field                      | Slice           | Scope                                    | Contract (conceptual)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | --------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vcs.listWorktrees`                          | E4.3            | `orchestration:read`                     | Input `{ cwd }`. Output `{ isRepo, mainPath, worktrees: [{ path, head, refName \| null, detached, locked, prunable, missing, isMain }] }` from `git worktree list --porcelain -z`. Includes detached and missing entries that `listRefs` filters out. Required composition: attach normalized checkout identity plus related Thread/Task/Integration IDs and `observedAt`/coverage. Resolve paths on the server; the client joins only canonical IDs. Omit unsupported associations |
| `VcsRef.headSha`, `VcsRef.committedAt`       | E4.3            | (existing `listRefs`)                    | Optional fields. `readGitRefsSnapshot` already reads `committerdate:unix`                                                                                                                                                                                                                                                                                                                                                                                                           |
| `VcsStatusResult.workingTree.untrackedCount` | E4.3            | (existing status)                        | Optional. Absent means unknown; the UI omits it                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `VcsCreateRefInput.baseRefName`              | E4.3 (optional) | (existing `createRef`)                   | Optional starting point. Without it, the dialog states that the branch starts at the checkout's HEAD                                                                                                                                                                                                                                                                                                                                                                                |
| `vcs.assessCheckoutSwitch`                   | E4.4            | `orchestration:read`                     | Input `{ cwd, targetRefName }`. Output `{ assessmentId, assessedAt, expiresAt, checkout: { path, refName, head, environmentLabel }, target: { refName, checkedOutAt \| null }, blockers: [{ code, evidence }], notices: [{ code, evidence }] }`. Codes per design §5.3. Joins Git state with the orchestration read model (threads by worktree path, Tasks, Integration batches), `TerminalManager` by cwd, and discovery                                                           |
| `vcs.switchRef` guarded mode                 | E4.4            | existing (`orchestration:operate` class) | Require a caller/context-bound `assessmentId` for public checkout switches; omission is never a bypass. Revalidate inside the existing coordinated operation and refuse typed blockers if state changes. Cover draft mutations and `createRef` with `switchRef: true` too; selection-only draft changes do not mutate. Older clients get an actionable typed refusal                                                                                                                |
| `vcs.assessWorktreeRemoval`                  | E4.4            | `orchestration:read`                     | Input `{ cwd, worktreePath }`. Output `{ eligibility: task-cleanup \| integration-cleanup \| not-eligible \| unmanaged, reasons[], ownerRef?, expiresAt }`. Read-only. No removal method is added in E4                                                                                                                                                                                                                                                                             |

Rules for every addition:

- Reads never mutate and never fetch from a remote. Ahead/behind uses existing upstream state; "Refresh" is explicit.
- Path comparison happens server-side with the same normalization Git uses. The client never matches worktrees by string manipulation.
- No secret-bearing output. Paths are shown start-truncated; nothing includes credentials or environment files.
- Backend behavior changes ship with focused tests at the contract boundary (schema decode), the driver (porcelain parsing for detached, locked, prunable), and the assessment (one test per blocker code, plus "changed between assessment and switch").

## 3. Per-screen handoff

### 3.1 Sidebar and project identity (Screen D, E4.1)

- **State ownership:** active project + checkout in `uiStateStore` (persisted). Route params win over persisted state. Expanded state uses existing `projectExpandedById`.
- **URL:** `checkout` search param on `/projects/$projectKey`, `/command-deck`, `/terminal-center`, `/settings`, and later `/branches`. Navigating between project destinations preserves it.
- **Actions:** navigate, expand/collapse, switch checkout (param only), open palette project switcher. No mutation.
- **Permissions:** read only (`orchestration:read`).
- **Failure/recovery:** invalid explicit checkout ref → “Checkout unavailable”, chooser, mutations disabled. Never substitute This Mac or another host. Missing ref may resolve a valid last-used checkout or representative, named visibly. Successor key lookup for regrouped projects. Offline environment → row shows offline glyph; navigation allowed.
- **Visual acceptance:** active project unmistakable (expanded, checkout line, selected sub-row with 2px bar); other projects collapsed; no layout shift on hover; sidebar at 232–480px stays aligned; `thread.jump.*` hints still render.
- **Backend dependency:** none.

### 3.2 Overview (Screen A, E4.2)

- **State ownership:** derived from snapshot atoms; Resume filter persisted per scoped ref; no copied execution state.
- **URL:** `/projects/$projectKey?checkout=`. Attention and Resume deep links use existing routes (`/$environmentId/$threadId`, Command Deck, Swarm, Terminal Center `taskId`, **E3** `connections`).
- **Actions:** open thread/Task/Mission, answer/approve (by navigating to the existing surface; Overview never approves inline in E4), start draft via launch bar, open Workbench, attach a discovered server (existing attach flow in the Workbench).
- **Permissions:** read; launch requires the same permissions as creating a thread today.
- **Failure/recovery:** per-card error with Retry; offline banner; no provider ready → launch bar disabled with reason and E3 link.
- **Visual acceptance:** no hero when the project has work; exactly one solid-violet control in the main column; context block visible without scrolling at 1280×720; every status icon + text; Needs you sorted by decision class; Live now distinguishes “Working” from “Idle · session open”; stopped sessions appear only in Resume.
- **Backend dependency:** Command Deck `validateSearch` change only.

### 3.3 Branches & Worktrees (Screen B, E4.3)

- **State ownership:** inventory query results in atoms keyed by `{environmentId, cwd}`; per-checkout status subscriptions opened lazily for visible rows; selection in route search (`?selected=<worktree label or ref>` optional) so the sheet survives reload.
- **URL:** `/projects/$projectKey/branches?checkout=&selected=`.
- **Actions:** inspect, open (thread, Workbench, editor), create worktree, create branch (no switch), open diff, open preview.
- **Permissions:** reads `orchestration:read`; `createWorktree`/`createRef` keep their current scopes.
- **Failure/recovery:** not a repo; no remote; detached; missing worktree (Task-owned → Task restore link); create failures show the server message in a Details disclosure.
- **Visual acceptance:** current checkout first and labelled; columns without data hidden; no switch or remove control in the row; table at ≥980px, two-line rows below; no horizontal page overflow.
- **Backend dependency:** `vcs.listWorktrees`, ref `headSha`/`committedAt`, optional `untrackedCount` and `baseRefName`.

### 3.4 Guarded switch and removal eligibility (E4.4)

- **State ownership:** dialog-local state machine `idle → assessing → blocked | clear → switching → switched | blocked`. Assessments are never cached beyond `expiresAt`.
- **Actions:** assess, re-check, open in new worktree (`vcs.createWorktree` then the Open menu), switch with `assessmentId`, check removal eligibility.
- **Permissions:** assessment `orchestration:read`; switch keeps `vcs.switchRef`'s current scope.
- **Failure/recovery:** server refusal returns typed blockers → dialog returns to Blocked with fresh evidence; network failure → "Couldn't check this checkout. Retry"; environment offline → blocked.
- **Visual acceptance:** no "Switch anyway", stash, discard, force, kill or stop actions anywhere; primary action when blocked is **Open X in a new worktree**; Enter never confirms; confirmation names environment, checkout, path and `A → X`.
- **Backend dependency:** `vcs.assessCheckoutSwitch`, guarded `vcs.switchRef`, `vcs.assessWorktreeRemoval`.

### 3.5 Workbench (Screen C, across E4.1–E4.2)

- **State ownership:** existing Terminal Workspace store, re-keyed by scoped ref (E4.1).
- **Actions:** switch workspace, open last workspace, restore hidden panes. Stop only where Nebula owns the process.
- **Visual acceptance:** each pane states environment (when not primary), worktree and Task; provider CLI panes say "Separate session"; Hide is distinct from Stop; closing a Preview leaves its server running.
- **Backend dependency:** none.

## 4. Bounded slices

Each slice is one reviewable PR against a dedicated branch. None merges to `main` without founder authority. Each lists what it must **not** touch.

### E4.1 — Project navigation and environment-scoped identity

**Scope:** `SidebarProjectSection` (+ popover, checkout line, sub-rows: Overview, Workbench, Tasks, Settings; Branches and Notes hidden), "This project / All" inbox filter, persisted active project/checkout, `checkout` search param on existing project routes, `ProjectCheckoutSwitcher` in project headers, successor-key lookup on every project route, Terminal Workspace state re-keyed by scoped ref with migration, "Workbench" label, workspace switcher popover, palette "Go to" commands (no default keys).

**Not in scope:** Overview content, new routes, server changes, theme changes, `LegacySidebar.tsx`.

**Acceptance:**

- [ ] Active project shows checkout line and destinations; other projects collapsed; hover/focus popover works by keyboard.
- [ ] A remote-only project shows its environment label in the sidebar tooltip and every project header.
- [ ] `?checkout=` round-trips through reload and between project destinations; an invalid explicit value shows “Checkout unavailable” and never falls back.
- [ ] Two checkouts of one repository on two environments keep separate Terminal Workspaces; existing workspaces survive migration.
- [ ] No mutation is reachable from navigation.
- [ ] Focused tests: `resolveProjectCheckout` table; migration of `terminalWorkspacesByProjectId`; palette group build.

### E4.2 — Overview (Project Home)

**Scope:** `ProjectContextBlock`, `ProjectAttentionList` + `deriveProjectAttention`, `ProjectResumeList`, `ProjectLiveNow` + `deriveAgentPresence` + `deriveDevServerOwnership`, `ProjectLaunchBar`, empty hero, Command Deck `selectedTask` outside Swarm mode, chat right-panel terminal close relabel and confirm.

**Not in scope:** inline approval actions, a new composer, Branches summary strip (E4.3), Notes card.

**Acceptance:**

- [ ] Every Needs you kind in design §3.3 renders from fixtures and links to the existing surface; ordering by decision class is tested.
- [ ] Interrupted sessions appear in Needs you; stale provider readiness never does.
- [ ] Launch bar creates a draft on the active checkout with the text carried into `composerDraftStore`; New Task and Plan a Mission prefill without starting anything.
- [ ] Live now lists only `starting/running/ready/working` sessions and classifies servers per §8.2 from fixtures.
- [ ] Loading, partial failure, offline, not-a-repo and empty-project states are reachable.
- [ ] 390, 768, 980, 1280, 1440, 1920, 2560px without horizontal overflow; dark and light; shipped theme and one custom theme.

### E4.3 — Branches & Worktrees (read, open, create)

**Scope:** `/projects/$projectKey/branches` route (or a Project panel if routing authorization requires it; record the choice), `vcs.listWorktrees`, ref `headSha`/`committedAt`, optional `untrackedCount` and `createRef.baseRefName`, `BranchInventory` + `joinWorktreeInventory`, `WorktreeDetailSheet` (inspect, work, services, open, diff, preview), create dialogs, sidebar Branches sub-row, Overview Branches summary.

**Not in scope:** switching, removal, assessment RPCs, any change to `vcs.switchRef` or `vcs.removeWorktree`.

**Acceptance:**

- [ ] Inventory shows detached, missing and locked worktrees from `listWorktrees`; main checkout first.
- [ ] Owner join uses canonical server-resolved IDs; fixtures include symlink/case aliases, detached/missing paths, two Threads in one worktree and duplicate ProjectIds on different hosts. Unknown associations remain unavailable.
- [ ] Facts without a source are omitted (refs without a checkout show no sync or PR).
- [ ] Creating a branch never switches; creating a worktree then opening a thread there produces a draft whose context strip shows that worktree.
- [ ] Server tests: porcelain parsing (detached, locked, prunable, missing), additive schema decode with older servers.

### E4.4 — Guarded switch and removal eligibility

**Scope:** `vcs.assessCheckoutSwitch`, guarded `vcs.switchRef` (`assessmentId`), `vcs.assessWorktreeRemoval`, `SwitchGuardDialog`, `RemovalEligibilityPanel`, composer branch picker retrofit for server threads (decision P5), `PaneIdentityHeader` if not already shipped.

**Not in scope:** a generic removal action, stash, force, discard, process termination, session stopping from the dialog, Task branch changes.

**Acceptance:**

- [ ] One server test per blocker code; one test where state changes between assessment and switch and the switch is refused with the new blocker.
- [ ] Task-owned and Integration worktrees never offer Switch.
- [ ] A running provider session, a running terminal subprocess, a managed dev server, uncommitted or untracked files each block.
- [ ] Unpublished commits produce a notice, not a blocker.
- [ ] Every public checkout mutation, including a draft and `createRef({ switchRef: true })`, refuses missing/invalid receipts and active ownership. An old client cannot bypass the guard.
- [ ] Receipts are bound to caller, environment, checkout, source HEAD and target; stale, reused or mismatched receipts are refused.
- [ ] Incomplete process/ownership/Git evidence blocks; lost responses trigger a status read, never an automatic mutation retry.
- [ ] Removal eligibility distinguishes Task cleanup, Integration cleanup, not eligible and unmanaged; no delete control renders.
- [ ] Guard dialog keyboard: Enter never confirms; Escape restores focus.

## 5. Verification for every slice

1. No hex or oklch literals in touched components (`rg "oklch\(|#[0-9a-fA-F]{6}"` on the diff).
2. Every status maps to a field named in §2.1. No status from a role, registration or label.
3. Default theme unchanged (`DEFAULT_THEME_SNAPSHOT.theme` stays `nebula` unless D1 is approved).
4. Breakpoints 390, 768, 980, 1280, 1440, 1920, 2560; dark and light; reduced motion.
5. Focused tests per §4; broaden only for affected boundaries or integration readiness; contracts/server slices require focused tests at each affected boundary, not an automatic repo-wide run.
6. Screenshots for PR evidence use synthetic projects; redact account emails and absolute home paths.
7. Compare against [the visual reference](reference/project-os.html); the documents win where they differ.

## 6. Risks and tricky areas

- **`Sidebar.tsx` and `ChatView.tsx` are large.** Add the Projects section as a separate component file with narrow props; do not grow `Sidebar.tsx` beyond the mount point.
- **Subscription fan-out.** Branches opens one `subscribeVcsStatus` per visible checkout. Cap concurrent subscriptions (suggest 12) and unsubscribe off-screen rows.
- **Grouping-mode rewrites.** Changing `sidebarProjectGroupingMode` rewrites `projectKey`; persisted active project must follow the successor.
- **Remote localhost.** Every Preview and server link for a non-primary environment says whose localhost it is.
- **Thread deletion removes worktrees with `force: true`** (`useThreadActions.ts`). Out of E4 scope; listed for the future removal workflow.
- **PR "local" mode uses `gh pr checkout --force`** (`GitHubCli.ts`). Out of E4 scope; the guard should cover it in a later slice.

## 7. Implementation preflight and compatibility

E4.1 requires invalid-explicit-checkout and ambiguous-legacy-layout fixtures. Never migrate a bare ProjectId into an arbitrary environment. E4.2 requires per-card partial failures and independently derived provider readiness; role definitions never create live rows. E4.3 requires the server composition above before ownership/process columns claim completeness. Source permissions remain `orchestration:read`, `orchestration:operate`, `terminal:operate`, `review:write` and E3 `access:write` as enforced by the actual method; a read-only screen does not grant terminal, diff or sign-in rights. Scope denials have a labelled recovery and preserve read access.

E4.4 must extend the existing Git workflow and coordination, not add a parallel Git lock service. Availability/capability negotiation and typed older-host refusal are required before enabling mutable switch controls. Existing PR-checkout and destructive thread-deletion paths are follow-up risks; the E4 UI must not route a guarded action around its checks through those paths. Worktree removal requires a separate, fresh server assessment within its own authorized cleanup flow.
