# Super ADE design contract

**Status:** Proposed design foundation (D0), with the Provider Connections update (D0.2), pending founder approval. It does not change runtime behavior. [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) remains the canonical visual source until the palette decision in [section 15](#15-founder-decisions) is approved.

**Inputs:** the approved Nebula Super ADE North Star mockup; the October 15, 2026 engineering feasibility audit; direct inspection of `main` at `4981af2c5`; and the running web client.

**D0.2 inputs:** E1 provider readiness as merged to `main` (PR #37, `1f78e8473`) and E2 authentication lifecycle at PR #40 head `4b2a955` (E2.5 local acceptance PASS, not merged). Code paths named for E1 and E2 resolve at those commits, not at this branch's base. User-facing references: [provider readiness](https://github.com/Cristian0101/nebula/blob/1f78e84735672fdd9d5afeade6b8ee36ef6734b5/docs/user/provider-readiness.md) and [provider authentication](https://github.com/Cristian0101/nebula/blob/4b2a955470802cecaee3ce4f245d29c6de8d708e/docs/user/provider-authentication.md).

**Delivered versus proposed.** Text marked **Delivered** describes E1/E2 behavior that exists in code. Everything else is **Proposed**. E3 implements the proposed Provider Connections UI.

**Companion documents:**

- [DESIGN_TOKENS.md](DESIGN_TOKENS.md)
- [COMPONENT_SPECIFICATIONS.md](COMPONENT_SPECIFICATIONS.md)
- [SCREEN_BLUEPRINTS.md](SCREEN_BLUEPRINTS.md)
- [INTERACTION_STATES.md](INTERACTION_STATES.md)
- [VISUAL_QA_CHECKLIST.md](VISUAL_QA_CHECKLIST.md)

## 1. Design vision

Nebula Super ADE is **one calm, project-centered workbench** for a developer who directs several coding agents. Open a project and immediately see four things:

- where you are,
- what is running,
- what needs you,
- how to start the next piece of work.

The interface earns trust by being precise about its own state. It never claims something is connected, running, reviewed or covered by a subscription unless Nebula has evidence.

The North Star mockup sets the **composition and mood**:

- near-black surfaces,
- a restrained violet action color,
- an ion-blue focus and info color,
- a generous composer,
- a tool launcher,
- notes and agents beside the work.

This contract sets the **behavior**, and the behavior rules where the two conflict. The mockup is a poster. The product is a tool used for eight hours a day.

### What we keep from the mockup

- Project identity at the top of every project screen.
- A wide, well-spaced composer with compact context controls beneath it.
- The "Open a surface" launcher.
- Project notes and active agents adjacent to the work.
- Calm charcoal surfaces with one violet action per region.
- Provider status visible from the shell.

### What we deliberately change

| Mockup element                                                       | Decision                                                                                                                     | Reason                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Large "Build without limits." hero on every project                  | Hero shown **only** for empty or new projects. Active projects lead with "Resume" and "Needs you"                            | Active-work screens prioritize content           |
| Top mode bar _and_ project tabs _and_ a tool rail, all on one screen | One surface-toggle group in the top bar. Project tabs only on Project Home. The tool grid is the context panel's empty state | Removes three overlapping navigation systems     |
| "Integrations: Grok Connected, Claude Connected"                     | Truthful provider summary with readiness facts                                                                               | Registration ≠ installed ≠ authenticated ≠ ready |
| Agent avatars with green online dots (Planner, Reviewer, DevOps)     | Real sessions show live status. Saved roles appear as templates with **no** status dot                                       | A role avatar is not a running agent             |
| "Nebula Pro · Team plan · 8 seats" tile                              | Removed                                                                                                                      | No product backing                               |
| Star count, decorative planet glow, sparkles                         | Removed from work screens. Static glow allowed in the empty-project hero only                                                | No idle repaint; no vanity metrics               |
| Model chip "Grok 3" beside a "Project" scope chip                    | Model chip shows the provider instance and model the runtime will actually use. Scope becomes the execution-context strip    | Execution location must be unmistakable          |

## 2. Design principles

These are the North Star principles, each with the rule it implies.

1. **Calm, premium, technical.** Hierarchy comes from surface steps and type, not color. One solid violet control per region. Nothing animates at idle.
2. **Project first, tools second.** Every screen answers "which project, which checkout?" before offering tools. Tools open _into_ the project context. They never float free of it.
3. **Everything in context.** The execution context travels with the work: Environment → Project → Branch → Worktree → Task → Provider → Permission. It is visible wherever something can write.
4. **Multi-agent without chaos.** Agents are listed by what they are: a provider connection, a saved role template, an active session, or an external collaborator. A running session is never drawn the same way as a template.
5. **Beautiful enough to live in daily.** Dense where work happens, spacious only where nothing else would fill the space. Dark and light are both first-class.
6. **Truthful states** (Nebula addition). Unknown is shown as unknown. "Authenticated", "subscription", "model available" and "ready" are separate facts. Readiness is never inferred from registration or from a paid inference call.

## 3. Scope boundaries

This is a design-only contract. Implementing it **must not**:

- rewrite orchestration, Task, Mission, review or integration systems;
- change provider authentication, or store, copy or display credentials. E3 consumes the delivered E2 lifecycle and adds no authentication behavior;
- add a conversation runtime, pane runtime, Git or worktree manager, or provider registry;
- modify SQLite schemas as part of visual work. Notes persistence is a separately authorized backend phase;
- invent subscription features, quotas, Grok Bot capabilities or provider capabilities;
- merge to `main`, publish, or trigger paid provider execution.

Every component in this package is labelled **Existing**, **Extend** (an existing component gains presentation or behavior) or **Proposed** (new presentation component). Proposed components compose existing stores, RPCs and commands. Where a proposal needs data that does not exist yet, the spec says so and names the audit phase that provides it.

## 4. Navigation architecture

### 4.1 Shell regions

```
┌──────────────┬──────────────────────────────────────────────────────┬────────────────────┐
│ Sidebar      │ Top toolbar (52px): breadcrumb · context · surfaces  │                    │
│ (256px,      ├──────────────────────────────────────────────────────┤ Context panel      │
│ resizable,   │                                                      │ (existing right    │
│ offcanvas)   │  Primary work surface                                │ panel; resizable;  │
│              │  (Project Home │ Chat │ Command Deck │ Swarm │ ...)  │ sheet ≤980px)      │
│              │                                                      │                    │
│              ├──────────────────────────────────────────────────────┤                    │
│              │ Terminal floor (existing drawer, 280px, ⌘J)          │                    │
└──────────────┴──────────────────────────────────────────────────────┴────────────────────┘
```

There is one sidebar, one top toolbar, one primary surface, one context panel and one terminal floor. **No region owns execution state.** Each region shows the canonical Thread, Task, Mission, terminal and preview resources through existing stores.

### 4.2 Global sidebar

**Extend** the existing `Sidebar.tsx`, `SidebarChrome.tsx`, `SidebarSwarmModeButton` and `SidebarUtilityMenu`. Do not add a third sidebar variant.

From top to bottom:

1. **Brand header (existing):**
   - mark,
   - "Nebula" wordmark,
   - "Super ADE" descriptor (proposed, `type-meta`, muted),
   - environment identification (existing artwork/pill/none modes).
2. **Search (existing → extend).** The field keeps its thread filter. Its trailing `⌘K` hint opens the command palette for code, file, project and action search.
3. **New thread (existing)**, labelled with its `chat.new` shortcut.
4. **Destinations:**
   - **Swarm** (existing status button: "3 active · Checkpoint 2", Planning, Ready, Brief),
   - **Terminal Center** (existing, "Remote & local workspaces"),
   - **All Projects** (existing project scope menu).
5. **Projects** (extend the existing project scope list):
   - The active project is expanded and highlighted.
   - Its row exposes **Home, Workbench, Tasks, Notes, Settings** as a sub-list instead of the current five `icon-xs` buttons.
   - Other projects stay collapsed.
   - "Show more…" follows the existing pattern.
6. **Threads (existing inbox):**
   - draft,
   - pinned,
   - active,
   - snoozed,
   - settled.

   The inbox stays the primary daily list. It is project-filtered when one project is in scope.

7. **Providers summary (proposed `ProviderReadinessSummary`):**
   - A single row with stacked provider marks, each carrying a status dot, plus text such as "1 ready · 1 needs attention". Stale instances are never counted as needing attention.
   - Clicking it opens the **Provider Connections** sheet over the current route.
   - It expands to per-instance rows on hover or focus. It never auto-expands and shifts the layout.
8. **Footer (existing):**
   - Settings,
   - Pull Requests,
   - Usage,
   - provider update pill.

Removed from the mockup: the "Integrations" list showing GitHub as a provider (GitHub is a source-control integration under Settings → Source Control, not a coding provider) and the plan/seats tile.

### 4.3 Top toolbar

**Extend** `WorkspacePageHeader`, `WorkspaceBreadcrumb` and `ChatHeader`. The toolbar holds three zones:

| Zone                                          | Contents                                                                                                                                            | Notes                                                                                                                                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Left: location                                | `Environment ▸ Project ▾ ▸ Thread` breadcrumb                                                                                                       | Environment segment appears only when not the primary local device, or always when there is more than one environment. Project ▾ is the existing project switcher (`DraftHeroHeadline` menu pattern) |
| Center: **Execution Context Chip** (proposed) | `⎇ branch · worktree-label · Task` compact chip; opens the Context popover                                                                          | Read-only summary of the thread's resolved context. See [section 5](#5-execution-context-contract)                                                                                                   |
| Right: actions                                | Surface toggles (Terminal ⌘J, Files, Diff, Preview ⌘⇧J, Agents), then `ProjectScriptsControl`, `OpenInPicker`, `GitActionsControl`, layout controls | Surface toggles extend `PanelLayoutControls`. "Workflow" in the mockup becomes the sidebar's Swarm destination, not a toolbar mode                                                                   |

**The mockup's `Chat | Terminal | Editor | Preview | Workflow` segmented control is not built as modes.** Chat is always the anchor of a thread. The other entries are toggles that open the existing right-panel surface or terminal floor. Their pressed state reflects whether that surface is open. This keeps one presentation vocabulary (right-panel surfaces plus terminal floor) and adds no third pane store.

The **"Connect providers"** gradient CTA appears in the top toolbar **only while at least one enabled primary provider needs attention for a fixable reason** (not installed, signed out, model not offered, API credential override) and the user has not dismissed it for this environment. Stale or unverified providers never trigger it. Otherwise provider access lives in the sidebar summary. This is the only gradient in the product.

### 4.4 Project-level navigation

Project Home (`/projects/$projectKey`) gains a project header with tabs. Tabs render **only for destinations that exist**:

| Tab      | Destination                                                | Status                                                                   |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| Overview | Project Home body                                          | Extend `ProjectLaunchpad`                                                |
| Tasks    | Command Deck Tasks section (`/projects/$key/command-deck`) | Existing route                                                           |
| Files    | File browser (`FileBrowserPanel`) in the context panel     | Existing component                                                       |
| Branches | Branches & Worktrees view                                  | Proposed (presentation over existing VCS contracts)                      |
| Notes    | Notes view                                                 | Proposed. Requires Notes backend (audit Phase 4); hidden until available |
| Settings | `/projects/$key/settings`                                  | Existing route                                                           |

The mockup's "Commits" tab is **deferred**. No commit-log view or query exists today, and the tab must not render as a placeholder.

### 4.5 Command palette

**Existing** `CommandPalette` (`⌘K`) remains the universal jump. Add these groups. Each is backed by an existing route or command, or hidden.

- **Go to:** Project Home, Workbench surfaces, Tasks, Swarm, Terminal Center, Branches, Notes, Provider Connections, Usage, Settings pages.
- **Providers:**
  - "Check provider status" (`server.refreshProviders`),
  - "Open Provider Connections",
  - "Sign in to {Provider}" (opens that instance's detail; shown only with `access:write` and an advertised ceremony),
  - "Update {provider}" (existing update flow).
- **Context:**
  - "Switch project",
  - "Open branch in worktree…" (Branches view),
  - "Copy context" (environment/project/branch/worktree as text).

Every primary surface must be reachable from the palette.

### 4.6 Context-sensitive navigation rules

- The sidebar's active-project sub-list and the Project Home tabs point to the **same** destinations. The sidebar is the persistent path; the tabs are the in-page path. Neither introduces a destination the other lacks.
- Opening a surface from Project Home ("Open a surface" tiles) opens the Workbench for the most recent thread in that project. With no thread, it opens a new draft with the surface attached. It never opens a project-less surface.
- Global Terminal Center remains a **fleet overview**. Project Terminal Center remains a **Workbench layout mode** reached from Project Home or the sidebar.

## 5. Execution context contract

### 5.1 The seven facts

Every writable surface must make these resolvable within one interaction (visible or one hover/click away). The first four are always **visible** on writable surfaces.

| #   | Fact             | Source                                                                            | Visible form                                                               |
| --- | ---------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Environment/host | Environment registry (`BranchToolbarEnvironmentSelector`, `SidebarStageBackdrop`) | Icon (monitor/cloud) + label; mandatory text when remote                   |
| 2   | Project          | Canonical environment-scoped project ref                                          | Favicon + name                                                             |
| 3   | Branch           | VCS status                                                                        | `⎇ name` in mono                                                           |
| 4   | Worktree         | Thread/Task workspace resolution                                                  | "Current checkout" or worktree label (mono, start-truncated path on hover) |
| 5   | Task (optional)  | Canonical Task                                                                    | `Task: title` chip when the thread belongs to a Task                       |
| 6   | Provider         | Thread's provider instance + model                                                | Provider mark + model short name                                           |
| 7   | Permission       | Runtime mode: Supervised / Auto-accept edits / Auto / Full access                 | Lock icon + label. Full access uses warning tone (existing)                |

### 5.2 Where context is shown

| Surface                                           | Facts shown inline                                        | Facts in popover                          |
| ------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| Top toolbar Execution Context Chip                | 3, 4, 5 (1 when remote)                                   | All seven + dirty/ahead/behind + HEAD SHA |
| Composer footer                                   | 6, 7 (existing pickers)                                   | —                                         |
| Composer context strip (existing `BranchToolbar`) | 1, 3, 4 (editable before first send, locked after)        | —                                         |
| Terminal pane header                              | 1, 4, plus "Shell" or "{Provider} CLI — separate session" | 3                                         |
| Agents rows                                       | 6, 4, 5, status                                           | 1, 7                                      |
| Task cards (Command Deck)                         | 4, 6, status                                              | existing Task inspector                   |
| Notes attach chip                                 | Note title + revision                                     | Scope                                     |

### 5.3 Rules

1. **Context is resolved by the server.** The client displays what the server resolved for the thread or Task. It never displays a renderer-chosen path as authoritative.
2. **Lock after first send.** A thread's environment and worktree are editable only in the draft state (existing `envLocked`). Afterwards the strip renders as text with a lock affordance and a "Start a new thread here…" action.
3. **Selecting is not retargeting.** Choosing a different branch or worktree in any picker never moves a running session. It opens or creates a different context.
4. **Mismatch is loud.** When the thread's recorded branch differs from the worktree HEAD (existing "branch mismatch" signal), the chip uses warning tone and the popover explains it.
5. **Remote is loud.** A remote environment always shows its label in the chip and a cloud icon in every terminal and preview header. A remote server's `localhost` is never presented as the user's localhost.
6. **Switching is a guarded flow**, never a one-click mutation. See the [switch-context sequence](INTERACTION_STATES.md#4-context-switching).

## 6. Interaction model

### 6.1 The core loop

| Step | User action                | Where                                           | Existing primitive                                            | Proposed presentation                 |
| ---- | -------------------------- | ----------------------------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| 1    | Open project               | Sidebar project row, palette, Project Home      | Routes, project scope                                         | Project header + "Resume"             |
| 2    | Choose worktree            | Composer context strip (draft) or Branches view | `BranchToolbarEnvModeSelector`, `BranchToolbarBranchSelector` | Execution Context Chip, Branches view |
| 3    | Choose provider            | Composer model picker                           | `ProviderModelPicker`, `ModelPickerSidebar`                   | Readiness facts inside the picker     |
| 4    | Start conversation or Task | Composer intent control                         | `ChatComposer` send; `TaskCreateFields`; Architect proposal   | Intent segmented control              |
| 5    | Open terminal/preview      | Toolbar toggles, "Open a surface"               | `ThreadTerminalDrawer`, `RightPanelTabs`, `PreviewPanel`      | Surface toggle group                  |
| 6    | Inspect changes            | Diff surface, Task Diff                         | `DiffPanel`, `TaskChangesPanel`                               | —                                     |
| 7    | Attach Notes               | Composer `@` menu, Notes view                   | —                                                             | Notes (proposed, audit Phase 4)       |
| 8    | Return later               | Sidebar inbox, Project Home "Resume"            | Thread inbox, recent threads                                  | Resume list + "Needs you"             |

### 6.2 Intents: Chat, Analyze, Task, Mission plan

The composer gains a visible **intent** control. Intent decides what Nebula does with the message. Two existing controls stay separate and keep their meaning:

| Control       | Values                                              | Existing?                                                                                 | Meaning                                       |
| ------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Intent**    | Chat · Analyze · Task · Mission plan                | Proposed                                                                                  | Which canonical workflow receives the message |
| Provider mode | Build · Plan                                        | Existing (`ProviderInteractionMode` default/plan, shown when `showInteractionModeToggle`) | How the provider behaves inside a Chat        |
| Access        | Supervised · Auto-accept edits · Auto · Full access | Existing (`RuntimeMode`)                                                                  | What the provider may do without asking       |

| Intent             | Primary button | What happens                                                                                                                                    | Availability                                                                                                                                                                                                                                                                                                      |
| ------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat** (default) | Send           | Existing canonical send to this thread's provider session                                                                                       | Always. Access label stays visible: Chat is **not** read-only when Access is Full access                                                                                                                                                                                                                          |
| **Analyze**        | Analyze        | A Chat turn under **provider-enforced** read-only behavior                                                                                      | Only when the selected provider exposes an enforceable read-only mode. Otherwise the option is visible but disabled, with reason "{Provider} can't enforce read-only here. Use Supervised access to approve each action." Prompt wording alone is never enough (see [founder decision F6](#15-founder-decisions)) |
| **Task**           | Create Task    | Opens the existing Task creation fields prefilled with the draft. Creates a canonical draft Task with a worktree. Starting is a separate action | Project has a Git repository; provider ready                                                                                                                                                                                                                                                                      |
| **Mission plan**   | Generate plan  | Requests an Architect plan proposal against a clean baseline. **Never executes.** Approval and Run authorization stay in Swarm                  | Clean Git baseline (existing check); provider ready                                                                                                                                                                                                                                                               |

Fix the existing label mismatch: the compact controls menu says "Chat/Plan" while the full footer says "Build/Plan". Both should read **Build/Plan**, so "Chat" means only the intent.

### 6.3 Session identity: Chat vs CLI terminal

Opening a provider CLI in a terminal pane starts a **new provider session** in the same worktree. It is not the thread's conversation.

- Provider CLI panes are titled `{Provider} CLI`. They carry the sub-label "Separate session, not linked to this chat" and an info icon that explains the difference.
- Linked Chat/Terminal layouts show a link glyph meaning **layout association** only. The tooltip reads "Shown together. Conversations are separate."
- When a supported resume mechanism exists later, the pane may say "Resumed from this chat". Simultaneous writers to one provider conversation must be prevented first.

## 7. Provider Connections (summary)

Full specification: [SCREEN_BLUEPRINTS.md §2](SCREEN_BLUEPRINTS.md#2-provider-connections), [INTERACTION_STATES.md §1](INTERACTION_STATES.md#1-provider-readiness-and-authentication), [COMPONENT_SPECIFICATIONS.md §3](COMPONENT_SPECIFICATIONS.md#3-provider-connections-components) and the [visual reference](reference/provider-connections.html). D0.2 reconciled this section with delivered code.

### 7.1 Delivered (engineering truth)

| Milestone                       | Status                                                                             | What it provides                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E1** Provider readiness       | Merged. PR #37, `1f78e8473`                                                        | Seven independent facts, each `verified`, `blocked` or `unknown`: registered, installed, authentication, account, subscription entitlement, model availability, runtime. A provider-reported `billingRoute` of `subscription`, `api`, `provider-managed` or `unknown`. Five-minute freshness. Display only, never permission or execution authority.                                                                   |
| **E2** Authentication lifecycle | Locally accepted. PR #40 open at `4b2a955`; E2.5 local acceptance PASS; not merged | `server.providerAuthentication` with `begin`, `status`, `cancel` and `refresh`; `browser`, `device-code` and `terminal` ceremonies; `access:write`; volatile five-minute attempts; ceremony data never persisted. Codex through the managed App Server, Cursor through its configured official CLI, Claude through a guided user-controlled terminal. No OAuth implementation, logout, API fallback or paid inference. |

### 7.2 Proposed (E3)

- **Navigation:** a sheet-first hybrid ([founder decision F12](#15-founder-decisions)). A focused right-hand sheet opens over the current route from the shell. Provider Settings stays the advanced destination.
- **Overview:** execution host scope, triage counts (Ready, Needs attention, Not verified), fixed-order cards for Codex, Cursor and Claude, then every other registered provider.
- **Detail:** next action, account and sign-in, the seven readiness facts, reported billing, diagnostics.
- **Sign-in:** provider-specific official ceremonies with private, expiring handoff data, and twenty recovery states that each name one next action.
- **One derivation:** `deriveProviderConnectionStatus` combines E1, E2, connection and scopes. Components render its output only.

### 7.3 Withdrawn D0 assumptions

| D0 assumption                                                                                                  | Corrected by | Now                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Seven facts at five levels, derived in the UI from raw snapshot fields                                         | E1           | E1's seven facts at three levels. The UI renders `deriveProviderReadiness` only. "Update available" is an advisory, not a fact                                                 |
| Billing route mapped from `auth.label`/`auth.type`, with a proposed `cloud` route                              | E1           | Typed `billingRoute`: `subscription`, `api`, `provider-managed`, `unknown`. Labels are never parsed                                                                            |
| A reported plan label meant "Subscription · met"                                                               | E1           | Subscription entitlement is its own fact, `unknown` for every driver today. The plan label is reported text in the detail only                                                 |
| An email or label meant "account identified"                                                                   | E1           | Account is verified only when authentication is verified and the probe sets `accountVerified`                                                                                  |
| A listed model meant "available"                                                                               | E1           | Only a fresh, provider-queried catalog for a signed-in, non-custom model                                                                                                       |
| `status === "ready"` meant "Ready"                                                                             | E1           | Runtime preflight needs a completed inspection at most five minutes old. Stale is neutral "Not verified", never a warning                                                      |
| Sign-in was a copied `codex login` / `agent login` command, an opened terminal and "Check again"; no login RPC | E2           | Typed lifecycle. Codex browser or device code through the App Server. Cursor's **configured** executable `login`. Claude in the person's own terminal, never a Nebula terminal |
| A future `begin`/`status`/`cancel`                                                                             | E2           | `begin`, `status`, `cancel`, `refresh`, with `attemptId` correlation and five-minute expiry                                                                                    |
| "Limited permissions (client lacks an `access:write`-equivalent)"                                              | E2           | Exactly `access:write` for sign-in, `orchestration:operate` for checks, `orchestration:read` for facts                                                                         |
| Readiness and sign-in on one ladder                                                                            | E1 + E2      | Two systems. A login never turns a fact green; the next fresh snapshot does. A login never guarantees a model or included usage                                                |
| Real observed fixtures                                                                                         | D0.2         | Synthetic fixtures only ([states §1.8](INTERACTION_STATES.md#18-synthetic-fixtures))                                                                                           |
| Device code "shown once"                                                                                       | E2 + D0.2    | Masked until revealed, held only in the mounted view, cleared on any reset                                                                                                     |
| Grok "signs in through the Grok CLI or an xAI API key"                                                         | E2           | Grok has no lifecycle. Its sign-in is `unsupported` in Nebula; readiness only                                                                                                  |

## 8. Workbench (summary)

Chat is the anchor. Terminal floor, context-panel surfaces (Browser/Preview, Files, File editor, Diff, Pull Request, Agents) and Project Terminal Center layouts share one surface vocabulary:

- Existing `rightPanelStore` surface kinds.
- Existing terminal workspace pane types.

Closing a view never stops a process or deletes a Task. Preview in the browser client shows a truthful "Desktop only" state with "Open in browser" (existing `PreviewPanel` message, restyled). See [SCREEN_BLUEPRINTS.md §4](SCREEN_BLUEPRINTS.md#4-unified-workbench).

## 9. Notes (summary)

Notes are human-authored, project-scoped (or environment-global) Markdown documents with revisions. Agents read them only by explicit attachment of a specific revision. Agent edits are proposals with a diff that a human accepts.

**Proposed. Requires the audit's Phase 4 backend.** No Notes UI ships before the revisioned persistence and authorization exist. See [SCREEN_BLUEPRINTS.md §5](SCREEN_BLUEPRINTS.md#5-native-notes).

## 10. Composer and Agents (summary)

- **Composer:** intent control, context strip, readiness-aware model picker, and attachment affordance. The composer has no attach button today; paste or drop only. A "+" menu adds Image, File reference, Note revision (when available), Terminal output and Preview element. All map to existing context chips.
- **Agents:** four labelled groups:
  - Active sessions (live),
  - Saved roles (templates, no live dot),
  - Provider connections (readiness),
  - External collaborators (references, "status unknown").

  Native provider subagents stay in the existing `AgentsPanel`.

See [SCREEN_BLUEPRINTS.md §6–7](SCREEN_BLUEPRINTS.md#6-composer--chat).

## 11. Responsive and accessibility (summary)

Breakpoints and panel behavior: [DESIGN_TOKENS.md §10](DESIGN_TOKENS.md#10-breakpoints).

Non-negotiables:

- **Contrast:** AA in both themes (audited).
- **Focus:** a visible ion focus ring on every interactive element.
- **Status:** always icon + text, never color alone.
- **Keyboard:** everything reachable by keyboard.
- **Shortcuts:** resolved through the keybinding registry with focus-aware `when` clauses. Terminal input is never intercepted.
- **Focus return:** after a dialog or sheet, focus returns to the launching control.
- **Live regions:**
  - login completion,
  - provider check results,
  - save failures,
  - approvals waiting.
- **Reduced motion** is honored everywhere.

## 12. Animation guidance (summary)

- Motion explains change in **place, state or progress**.
- Durations run 80–220ms (tokens in [DESIGN_TOKENS.md §8](DESIGN_TOKENS.md#8-motion)).
- Only `opacity` and `transform` animate, and every animation is interruptible.
- The only continuous animation is the existing duty-cycled status pulse on genuinely live work.
- No starfields, orbits or idle glows.

## 13. Existing component reuse map

| Need                         | Reuse                                                                                                                                                                  | Treatment                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| App shell                    | `AppSidebarLayout`, `ui/sidebar`                                                                                                                                       | Existing                                                           |
| Sidebar                      | `Sidebar`, `SidebarChrome`, `SidebarSwarmModeButton`, `SidebarThreadRow`, `SidebarUtilityMenu`                                                                         | Extend                                                             |
| Environment identity         | `SidebarStageBackdrop`, environment pill mode                                                                                                                          | Existing                                                           |
| Page header and breadcrumb   | `WorkspacePageHeader`, `WorkspaceBreadcrumb`, `ChatHeader`                                                                                                             | Extend                                                             |
| Project Home                 | `ProjectLaunchpad`, `DraftHeroHeadline`                                                                                                                                | Extend                                                             |
| Branch and worktree pickers  | `BranchToolbar`, `BranchToolbarBranchSelector`, `BranchToolbarEnvModeSelector`, `BranchToolbarEnvironmentSelector`                                                     | Existing (and data source for the proposed Branches view)          |
| Git actions                  | `GitActionsControl`, `PullRequestThreadDialog`                                                                                                                         | Existing                                                           |
| Command palette              | `CommandPalette`, `CommandPaletteContent`, `commandPaletteBus`                                                                                                         | Extend (groups)                                                    |
| Keybindings                  | `DEFAULT_KEYBINDINGS`, `resolveShortcutCommand`, `KeybindingsSettings`                                                                                                 | Existing; new commands registered there                            |
| Tool launcher                | `RightPanelEmptyState` ("Open a surface", B/T/F/D/P/A)                                                                                                                 | Extend (restyle as tool tiles; reuse on Project Home)              |
| Context panel                | `rightPanelStore`, `RightPanelTabs`, `RightPanelSheet`, `PreviewPanelShell`                                                                                            | Existing                                                           |
| Terminal floor               | `ThreadTerminalDrawer`                                                                                                                                                 | Existing                                                           |
| Workbench layouts            | `ProjectTerminalWorkspace`, `terminalWorkspace.ts`                                                                                                                     | Existing                                                           |
| Files and editor             | `FileBrowserPanel`, `FilePreviewPanel`                                                                                                                                 | Existing                                                           |
| Diff                         | `DiffPanel`, `DiffPanelShell`, `TaskChangesPanel`                                                                                                                      | Existing                                                           |
| Preview                      | `PreviewPanel`, `PreviewEmptyState`, `PreviewUnreachable`                                                                                                              | Existing (restyle the desktop-only state)                          |
| Provider readiness           | `deriveProviderReadiness` (E1), `useProviderReadiness`, `ProviderReadinessDetails`, `providerStatus.ts`                                                                | Existing (delivered E1); copy moves to a shared module             |
| Provider authentication      | `server.providerAuthentication` (E2), `serverEnvironment.providerAuthentication`, `ProviderAuthenticationControls`                                                     | Existing (delivered E2); lifecycle logic extracted into a hook     |
| Provider settings            | `ProviderSettingsPanel`, `ProviderInstanceCard`, `AddProviderInstanceDialog`, `ProviderModelsSection`                                                                  | Existing (advanced configuration destination)                      |
| Provider icons               | `ProviderInstanceIcon`, `providerIconUtils`                                                                                                                            | Existing                                                           |
| Provider banners and updates | `ProviderStatusBanner`, `ProviderUpdate*Notification`, `SidebarProviderUpdatePill`                                                                                     | Extend (actions)                                                   |
| Composer                     | `ChatComposer`, `ComposerPrimaryActions`, `CompactComposerControlsMenu`, `composerFooterLayout`, `ComposerCommandMenu`, pending panels                                 | Extend                                                             |
| Model picker                 | `ProviderModelPicker`, `ModelPickerContent`, `ModelPickerSidebar`, `TraitsPicker`                                                                                      | Extend (readiness facts)                                           |
| Plans                        | `ProposedPlanCard`, `ComposerPlanFollowUpBanner`, `ArchitectPlanPanel`                                                                                                 | Existing                                                           |
| Agents                       | `AgentsPanel`, `subagentRuntime`, live-agent badge in `PanelLayoutControls`                                                                                            | Existing                                                           |
| Thread status                | `ThreadStatusIndicators`, `Sidebar.logic.ts` pills, `ThreadSyncStatusPill`                                                                                             | Extend (token routing)                                             |
| Tasks                        | `ProjectTasksSection`, `ProjectTaskCard`, `TaskCreateFields`, `TaskInspector`                                                                                          | Existing                                                           |
| Swarm and Missions           | `CommandDeck`, `SwarmWorkspace`, `MissionCommandCenter`, `MissionPanel`, `IntegrationPanel`                                                                            | Existing                                                           |
| Usage                        | `UsagePage`, `UsageProviderChart`                                                                                                                                      | Existing                                                           |
| Primitives                   | `ui/*`: button, badge, card, dialog, sheet, menu, popover, select, combobox, command, tooltip, kbd, empty, skeleton, spinner, toast, toggle-group, scroll-area, switch | Existing. **Add** `ui/tabs` (proposed; tabs are hand-rolled today) |

## 14. Design artifact locations

| Artifact                                     | Location                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This contract                                | `docs/nebula/super-ade/SUPER_ADE_DESIGN_CONTRACT.md`                                                                                                                                                                                                                                                                                                                                                                                                        |
| Tokens and contrast audit                    | `docs/nebula/super-ade/DESIGN_TOKENS.md`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Component specifications                     | `docs/nebula/super-ade/COMPONENT_SPECIFICATIONS.md`                                                                                                                                                                                                                                                                                                                                                                                                         |
| Screen blueprints                            | `docs/nebula/super-ade/SCREEN_BLUEPRINTS.md`                                                                                                                                                                                                                                                                                                                                                                                                                |
| Interaction states                           | `docs/nebula/super-ade/INTERACTION_STATES.md`                                                                                                                                                                                                                                                                                                                                                                                                               |
| Visual QA checklist                          | `docs/nebula/super-ade/VISUAL_QA_CHECKLIST.md`                                                                                                                                                                                                                                                                                                                                                                                                              |
| Provider Connections visual reference (D0.2) | [`reference/provider-connections.html`](reference/provider-connections.html): self-contained, synthetic data only, dark and light, 1440 / 1280 / 390 / ultrawide, sign-in flows, recovery states and interaction states. **It supersedes the canvas for Provider Connections.** The documents win wherever it differs                                                                                                                                       |
| Visual reference prototype                   | Private claude.ai design canvas: "Nebula Super ADE — Screen Reference" (nine screens: Project Home, Workbench with live intent switching, Provider Connections list and detail, Branches with switch guard, Notes, Agents, Swarm, empty project in light theme, state sheet). Every screen has a dark/light theme toggle. Shared on request. Not committed, to keep PR-only evidence out of the worktree. **The documents win wherever the canvas differs** |

## 15. Founder decisions

| ID  | Decision                                | Recommendation                                                                                                                                                                                                                                            | Consequence if declined                                                              |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| F1  | Adopt violet/ion as the product palette | **Yes**, as additive built-in `nebula-ion` and the new fresh-client default. Coral `nebula` remains selectable as "Nebula Solar". The default changes only in D1 after approval; no other milestone (including E3) changes it                             | Keep coral. Tokens map 1:1 by swapping `accent`/`messageAction`/`focus` values       |
| F2  | Brand mark                              | Commission a vector mark package. Keep the temporary mark meanwhile; do not trace the mockup's cube "N"                                                                                                                                                   | Shell ships with the temporary mark                                                  |
| F3  | Primary navigation model                | Project-centered shell with one toolbar surface-toggle group; no Chat/Terminal/Editor/Preview/Workflow mode bar                                                                                                                                           | A mode bar would need its own state and duplicate `rightPanelStore`                  |
| F4  | Claude subscription messaging           | Show only provider-reported route and labels ("reported by Claude"), plus the eligibility caveat in [states §1.4.3](INTERACTION_STATES.md#143-claude-guided-terminal); no "use your Claude subscription in Nebula" marketing until provider clarification | —                                                                                    |
| F5  | "Connect providers" CTA visibility      | Toolbar CTA only while an enabled primary provider needs attention for a fixable reason; never for stale or unverified; otherwise sidebar summary only                                                                                                    | Permanent CTA adds noise once connected                                              |
| F6  | Analyze intent                          | Show only where read-only is provider-enforced; disabled with reason elsewhere                                                                                                                                                                            | Hide Analyze entirely                                                                |
| F7  | Saved roles in the Agents strip         | Show as templates (no live dot), after active sessions                                                                                                                                                                                                    | Hide roles until instantiated                                                        |
| F8  | Commits tab                             | Defer until a commit-log query exists                                                                                                                                                                                                                     | —                                                                                    |
| F9  | Light theme parity bar                  | Ship dark and light together for `nebula-ion`                                                                                                                                                                                                             | Dark-only would break the appearance model                                           |
| F10 | Notes default agent policy              | **Attachable** (explicit attach only); Private available; Project-context opt-in per project                                                                                                                                                              | —                                                                                    |
| F11 | Mobile                                  | Shared contracts only; mobile keeps inherited default theme in this initiative                                                                                                                                                                            | —                                                                                    |
| F12 | Provider Connections navigation         | **Sheet-first hybrid**: a right sheet over the current route (600px; 1000px two-pane at ≥1920; full screen under 768px), addressable by search params, with Provider Settings as the advanced destination                                                 | A dedicated `/providers` route loses project context and tends to duplicate Settings |
| F13 | Verify on open                          | Opening the sheet refreshes stale enabled instances once (≤ every 60s) and reads lifecycle `status`. Checks never send a paid request                                                                                                                     | Users see "Not verified" until they press Check all                                  |
| F14 | Device code display                     | Masked until "Show code"; held only in the mounted view                                                                                                                                                                                                   | Shown immediately; easier to read, riskier when screen sharing                       |
| F15 | Claude terminal command                 | Show executable, `CLAUDE_CONFIG_DIR` and fixed `auth login` separately; no composed, copyable shell line in E3                                                                                                                                            | A composed line needs per-shell quoting (zsh, bash, PowerShell) and review           |
| F16 | Cursor and Grok presentation            | Cursor is a primary card; Grok stays a separate registered provider. No family grouping and no X Subscription claim until a provider probe reports one                                                                                                    | Grouping implies shared accounts or entitlement Nebula can't verify                  |

## 16. Engineering implementation handoff

### 16.1 Sequencing

The sequence follows the audit's PR plan. Visual work (PR 12 in the audit) is split so the shell can land early without waiting for Notes.

| Step | Scope                                                                                                                | Depends on                           | Design docs                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| D1   | `nebula-ion` theme, additive success/info roles, motion/elevation tokens, contrast tests                             | F1                                   | Tokens §2–8                                                                                                    |
| D2   | **E3** Provider Connections: sheet, summary, CTA, sign-in ceremonies, recovery states, banner/picker/palette entries | E1 (merged), E2 (PR #40 merged), F12 | Components §2.4, §2.7, §3; Screens §2; States §1; [§16.4](#164-e3-implementation-handoff-provider-connections) |
| D3   | Execution Context Chip + popover + terminal pane identity labels                                                     | Audit PR 4                           | Components §4, States §2–4                                                                                     |
| D4   | Project Home (Overview) + project header tabs + tool tiles reuse                                                     | Audit PRs 5–6 for inventory data     | Screens §1                                                                                                     |
| D5   | Toolbar surface toggles + Workbench polish                                                                           | Audit PR 7                           | Screens §4                                                                                                     |
| D6   | Branches & Worktrees view                                                                                            | Audit PR 5                           | Screens §3                                                                                                     |
| D7   | Composer intent control + attach menu + Agents groups                                                                | Audit PR 10                          | Screens §6–7                                                                                                   |
| D8   | Notes UI                                                                                                             | Audit PRs 8–9                        | Screens §5                                                                                                     |
| D9   | Swarm entry restyle + Mission navigation                                                                             | —                                    | Screens §8                                                                                                     |

### 16.2 What Codex must verify in every step

1. **No literals.** No new hex/oklch literals in components; `rg "oklch\(|#[0-9a-fA-F]{6}" apps/web/src/components` diff is empty for touched files.
2. **Truthful states.** Every status shown maps to a field in `ServerProvider`, `RuntimeSubagentStatus`, thread/session status or a VCS query. Provider statuses come only from E1 `deriveProviderReadiness` and E2 lifecycle responses. No status is computed from a role, a registration or a label alone.
3. **Context.** Writable surfaces show facts 1–4. Switching paths go through the guarded flow.
4. **Keyboard.** Every new control is reachable by Tab. Shortcuts are registered in `DEFAULT_KEYBINDINGS` with `when` clauses. Nothing fires inside a focused terminal unless already terminal-scoped.
5. **Themes.** Dark, light, one custom theme, and `nebula` (Solar) all render without regressions. Theme halves and glass opacity still work.
6. **Breakpoints.** 375, 768, 980, 1280, 1920 and 2560px widths.
7. **Reduced motion.** Verified with OS setting and `.no-transitions`.
8. **No secret exposure.** Screenshots used as PR evidence redact account emails (existing `RedactedSensitiveText`).
9. **Components.** The [visual QA checklist](VISUAL_QA_CHECKLIST.md) items for each touched surface are checked.

### 16.3 Tricky areas

- **`ChatView.tsx` (~6.9k lines) and `ChatComposer.tsx` (~3.4k lines):**
  - Extract the intent control and attach menu as separate components with narrow props before wiring them in.
  - Do not grow these files.
- **`ProjectTerminalWorkspace.tsx` (~6.5k lines):** pane header identity labels should be a small shared component used by both the right-panel terminal and workspace panes.
- **Sidebar active-project sub-list:** the current per-project icon buttons are keyboard-reachable. The sub-list must keep that and keep the existing `thread.jump` hints working.
- **Surface toggles vs `RightPanelTabs`:** both read and write `rightPanelStore`. Do not cache open state in the toolbar.
- **Readiness derivation:** delivered in E1 as `deriveProviderReadiness`. E3 adds only `deriveProviderConnectionStatus` on top of it, with table-driven tests. UI components only render its output.
- **Two lifecycle implementations:** E3 must extract the delivered `ProviderAuthenticationControls` logic into one hook rather than writing a second polling loop.
- **Context chip:** must render during loading (skeleton with fixed width) to avoid toolbar layout shift.

### 16.4 E3 implementation handoff: Provider Connections

**Preconditions:**

1. PR #40 (E2) is merged to `main`. If E3 must start earlier, branch from PR #40's head and rebase after it merges. E1 is already on `main`.
2. Founder decision F12 is approved. F13–F16 apply as recommended unless the founder declines them.
3. **Not** a precondition: F1/D1. E3 uses theme roles only and renders in whichever theme is active. E3 must not change the default theme.

**In scope:**

| Area               | Work                                                                                                                                                         | Files                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure logic         | `deriveProviderConnectionStatus`, fact/billing/lifecycle/recovery copy, search-param schema, per-driver ceremony copy                                        | New `apps/web/src/components/providerConnections/*.ts` with tests                                                                           |
| Lifecycle hook     | Extract `useProviderAuthenticationAttempt` from `ProviderAuthenticationControls` without behavior change; add the volatile attempts atom and background poll | New hook; `settings/ProviderAuthenticationControls.tsx` consumes it                                                                         |
| Sheet              | Sheet, scope, triage strip, cards, detail, fact grid/list, billing, diagnostics, sign-in panel and steps, private code, countdown, recovery notices          | New `providerConnections/*.tsx`; `ui/sheet` width variant                                                                                   |
| Shell entries      | Sidebar summary, toolbar CTA, banner action, composer "Fix" link, model picker link, palette group, `providers.open` command (no default key)                | Small slots in `Sidebar.tsx`, `ChatHeader`/toolbar, `ProviderStatusBanner.tsx`, `composerProviderState.tsx`, model picker, `CommandPalette` |
| Settings deep link | `instance` search param expands one card; "Open in connections" link                                                                                         | `ProviderSettingsPanel.tsx`, `settings.providers.tsx`                                                                                       |

**Out of scope:** server, contract or schema changes; new RPCs or events; logout; API key entry; credential import or display; automatic API fallback; paid inference; Claude OAuth; theme default changes; mobile; Notes and other D-steps.

**Suggested commit sequence:**

1. Pure modules and table-driven tests. Extract the hook; existing `ProviderAuthenticationControls` tests stay green.
2. Read-only sheet: scope, triage, cards, other providers, search params, palette entry.
3. Detail: facts, billing, diagnostics, Provider Settings link.
4. Sign-in: panel, Codex browser and device code, Cursor, Claude guided terminal, outcomes, recovery notices.
5. Shell entries: sidebar summary, CTA, banner, composer link, model picker link.
6. Responsive (390, ≥1920 two-pane), accessibility pass, visual QA in dark and light.

**E1 dependencies:** `deriveProviderReadiness`, `ProviderReadiness`, `ReadinessFact`, `PROVIDER_READINESS_MAX_AGE_MS` (`packages/shared/src/providerReadiness.ts`); `ServerProvider.inspection`, `modelCatalogSource`, `auth.billingRoute`, `auth.accountVerified`, `auth.subscriptionEntitlement` (`packages/contracts/src/server.ts`); `server.refreshProviders({ instanceId })`.

**E2 dependencies:** `ExecutionEnvironmentCapabilities.providerAuthentication` (`packages/contracts/src/environment.ts`); `WS_METHODS.serverProviderAuthentication`; `ProviderAuthenticationInput`, `ProviderAuthenticationStatus`, `ProviderAuthenticationCeremony`, `ProviderAuthenticationState` (`packages/contracts/src/providerAuthentication.ts`); `serverEnvironment.providerAuthentication` (`packages/client-runtime/src/state/server.ts`); `AuthAccessWriteScope`.

**Authorization behavior:**

| Capability on the selected host                | Required scope          | Without it                                                                                     |
| ---------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| See readiness facts and billing                | `orchestration:read`    | The sheet shows the existing permission state                                                  |
| Check again, Check all, verify on open, Enable | `orchestration:operate` | Buttons are absent; facts stay; copy "Checking needs Operate access on {host}"                 |
| Read lifecycle status, begin, cancel, refresh  | `access:write`          | No sign-in control renders. "Needs Manage access" with `Lock`. Never request or upgrade scopes |
| Capability flag absent (older host)            | —                       | Older-host banner; Check again only                                                            |

**Required tests (synthetic data only):**

- Unit: every fixture in [states §1.8](INTERACTION_STATES.md#18-synthetic-fixtures); every E2 `state` × `reason`; exhaustive `Record` copy maps so a new enum value fails to compile; search-param schema rejects anything but `all`, an instance ID and an environment ID.
- Hook: reset on each key; generation guard against late replies; the attempts atom never holds `handoff`; 1s and 5s polling and their stop conditions; client expiry; reopening during an attempt; transport failure clears ceremony data.
- Components (browser tests, like the existing `ProviderAuthenticationControls.test.tsx`): keyboard-only overview → detail → sign-in → success; focus return; masked code and reveal; countdown announcements; no-access; disconnect mid-attempt; host switch; instance replacement.

**Evidence:** use the [web verification skill](../../../.agents/skills/test-t3-app/SKILL.md) against a task-owned fixture home with synthetic provider state. Capture 1440, 1280, 390 and 2560 in dark and light with account redaction on. Never capture real ceremonies, URLs, codes, pairing screens or account emails. Real-account sign-in stays under the separately approved [dogfood procedure](https://github.com/Cristian0101/nebula/blob/4b2a955470802cecaee3ce4f245d29c6de8d708e/docs/operations/provider-authentication-dogfood.md) (PR #40).

### 16.5 E3 acceptance checklist

**Truthfulness**

- [ ] Every fact renders from `deriveProviderReadiness`. No component reads raw `auth.*`, `status` or `models` to decide a status.
- [ ] "Ready" appears only when E1 `runtime` is `verified`. Its sub-text is "Preflight passed".
- [ ] Stale instances read "Verification expired · checked {relative}" in neutral tone and are not counted as Needs attention.
- [ ] Billing is always labelled "reported". `auth.label` appears only in the detail. Subscription entitlement reads "Not verified".
- [ ] A lifecycle `authenticated` never turns a fact green before the fresh snapshot does. Success copy says sign-in doesn't guarantee a model or included usage.
- [ ] Cursor shows "X Subscription migration: Unknown". Claude shows the F4 eligibility caveat. Grok, Antigravity and OpenCode show no Nebula sign-in.

**Ceremonies**

- [ ] Codex offers browser and device code; device code is primary on a remote host; custom launch arguments show the E2 guidance instead.
- [ ] Cursor shows the configured executable and never assumes `agent` is Cursor.
- [ ] Claude shows executable, `CLAUDE_CONFIG_DIR` and fixed `auth login` text only. No Nebula terminal, no composed shell line, no OAuth.
- [ ] `begin`, `cancel` and `refresh` carry the exact environment, instance and current `attemptId`; mismatched responses are discarded.
- [ ] Closing the sheet never cancels an attempt; reopening re-reads it with `status`.
- [ ] Every one of the twenty recovery states in [states §1.5](INTERACTION_STATES.md#15-recovery-states) is reproducible with a fixture and shows its primary action.

**Privacy**

- [ ] Login URLs render as host names only and open only on click.
- [ ] Device codes are masked until "Show code" and cleared on any terminal state, expiry, unmount or reset.
- [ ] No ceremony data in URLs, storage, the attempts atom, toasts, notifications, the title, the palette, the sidebar summary, logs, analytics or history. Verified by test and by a manual storage inspection.
- [ ] Reconnect, host switch, permission loss and instance replacement each clear ceremony views and return to "Verification needed".

**Navigation and layout**

- [ ] The sheet opens from all seven entry points, overlays the current route without remounting it, and returns focus to the launcher.
- [ ] Back closes the sheet or pops the detail. Search params never carry ceremony or account data.
- [ ] 1440 (600px sheet), 1280 (560px), 390 (full screen) and ≥1920 (1000px two-pane) match [blueprint §2.10](SCREEN_BLUEPRINTS.md#210-responsive-and-appearance) with no horizontal scroll.
- [ ] Dark and light render from theme roles only. No new color literals. At most one solid violet control in the sheet.
- [ ] `ProviderInstanceCard` and `ProviderSettingsPanel` do not grow beyond the wiring in [components §3.15](COMPONENT_SPECIFICATIONS.md#315-existing-settings-components-extend-lightly).

**Accessibility**

- [ ] Keyboard-only completion of every flow; visible focus everywhere; Esc closes without cancelling.
- [ ] Status is icon plus text everywhere. Live regions fire for check results, progress, success, failure, one-minute warning and expiry.
- [ ] VoiceOver smoke pass over overview, detail, device code and Claude steps.
- [ ] Reduced motion removes slides, pulse and highlight.

**Authorization**

- [ ] Without `access:write`, no sign-in control renders and facts remain visible.
- [ ] Without `orchestration:operate`, no check control renders.
- [ ] No code path requests, upgrades or works around a scope.
