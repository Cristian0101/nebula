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

**D0.2 update:** [§2 Provider Connections](#2-provider-connections) is reconciled with delivered E1 readiness and E2 authentication and is the E3 implementation target. It has a high-fidelity [visual reference](reference/provider-connections.html). The other blueprints are unchanged from D0.

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
| No provider ready               | Composer disabled with reason when E1 `runtime` is `blocked`. Attention gets "Connect a provider" first. `ConnectProvidersCta` visible                  |
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

**Status:** Proposed E3 presentation (D0.2) over **delivered** E1 readiness and E2 authentication. Data rules, copy and the state matrix live in [INTERACTION_STATES.md §1](INTERACTION_STATES.md#1-provider-readiness-and-authentication). The high-fidelity [visual reference](reference/provider-connections.html) shows every screen below in dark and light. Where the reference and these documents differ, the documents win.

**Purpose:** on one execution host, show at a glance which providers are ready, which need attention and which are not verified. Connect each one through its official ceremony without leaving the current project.

### 2.1 Navigation decision: sheet-first hybrid

**Recommendation: a hybrid.** A focused right-hand sheet, opened from the shell over the current route, holds the overview, the provider detail and every sign-in ceremony. Deep configuration stays in the existing Provider Settings route, one link away.

| Option                               | Keeps project context                       | Fits multi-step ceremonies                                           | Duplicates Provider Settings                      | Verdict         |
| ------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------- | --------------- |
| Dedicated destination (`/providers`) | No. Navigation leaves the thread or project | Yes                                                                  | Likely. A second full provider page invites forms | Rejected        |
| Modal dialog (centered)              | Partly. It hides the work behind it         | Poorly. Browser hand-offs and terminal steps outlive a dialog        | No                                                | Rejected        |
| **Sheet-first hybrid**               | **Yes.** The route underneath stays mounted | **Yes.** Detail pushes inside the sheet; attempts survive closing it | **No.** Forms stay in Settings                    | **Recommended** |

Rules:

- **Container.** `ProviderConnectionsSheet`, `ui/sheet` from the right. Widths in [§2.10](#210-responsive-and-appearance).
- **Addressable.** Search params on the current route: `connections=all` or `connections={instanceId}`, plus `connectionsEnv={environmentId}`. Back closes or pops the detail. The palette and composer deep-link with them. **Never** put ceremony data, account data or attempt IDs in the URL.
- **Context preserved.** The underlying route never navigates or remounts. Closing returns focus to the launcher. When the launcher was the composer's "Fix" link, success offers "Back to composer", which closes the sheet and focuses the composer.
- **Attempts outlive the sheet.** Closing during an attempt does not cancel it. The sidebar summary shows "Signing in · {Provider}" until the attempt ends or expires. Reopening re-reads it with `status`.
- **No forms.** The sheet never edits paths, environment variables, launch arguments, models or appearance. Its only mutations are Check again, the E2 lifecycle, Enable, the existing Update action and the existing Add provider dialog.
- **Deeper diagnostics.** The detail's collapsed "Diagnostics" section covers support needs. "Open in Provider Settings" goes to `/settings/providers` with that instance expanded (proposed `instance` search param). Codex verifies that the existing Settings back control returns to the originating route and adds a `returnTo` only if it does not.

**Entry points** (all open the same sheet):

| Entry                                                         | Opens                                | Status             |
| ------------------------------------------------------------- | ------------------------------------ | ------------------ |
| Sidebar `ProviderReadinessSummary`                            | Overview, current environment        | Proposed           |
| Toolbar `ConnectProvidersCta`                                 | Overview filtered to Needs attention | Proposed           |
| Composer disabled reason "Fix"                                | Detail of the composer's instance    | Extend             |
| `ProviderStatusBanner` action                                 | Detail of the banner's instance      | Extend             |
| Model picker "Manage connections"                             | Detail of the highlighted instance   | Extend             |
| Palette "Open Provider Connections" / "Sign in to {Provider}" | Overview / detail                    | Extend             |
| Settings → Providers "Open connections"                       | Overview                             | Extend (link only) |

### 2.2 Overview (screen A)

Desktop 1440×900. The sheet is 600px. The shell stays visible behind a scrim.

```
┌ Shell: sidebar · toolbar · Project Home ┬ Provider connections ─────────────── [⟳ Check all] [✕] ┐
│ (mounted, behind `--scrim`)             │ Execution host [▣ This Mac ▾]  ● Connected · Manage access │
│                                         │ [All 6] [● Ready 1] [▲ Needs attention 1] [◌ Not verified 1]│
│                                         ├────────────────────────────────────────────────────────────┤
│                                         │ Primary providers                                          │
│                                         │ ┌──────────────────────────────────────────────────────────┐│
│                                         │ │ [Cx] Codex                                   ● Ready    ›││
│                                         │ │      OpenAI · App Server · on This Mac                    ││
│                                         │ │ Sign-in        Account           Billing · reported       ││
│                                         │ │ ✓ Signed in    ✓ ••••@••••       Subscription             ││
│                                         │ │ Model          Runtime           Last check               ││
│                                         │ │ ✓ {model}      ✓ Preflight passed 1 min ago               ││
│                                         │ └──────────────────────────────────────────────────────────┘│
│                                         │ ┃┌────────────────────────────────────────────────────────┐ │
│                                         │ ┃│ [Cu] Cursor                      ▲ Sign-in required    › │ │
│                                         │ ┃│      Cursor Agent CLI · on This Mac  [Sign in with Cursor]│ │
│                                         │ ┃│ ✗ Signed out   ◌ Not reported    ◌ Not reported          │ │
│                                         │ ┃│ ◌ Not verified ✗ Blocked         2 min ago               │ │
│                                         │ ┃└────────────────────────────────────────────────────────┘ │
│                                         │ ┌──────────────────────────────────────────────────────────┐│
│                                         │ │ [Cl] Claude          ◌ Verification expired [Check again]›││
│                                         │ │      Anthropic · Claude Code · on This Mac                ││
│                                         │ │ ◌ Not verified ◌ Not reported    ◌ Not reported           ││
│                                         │ │ ◌ Not verified ◌ Not verified    checked 12 min ago       ││
│                                         │ └──────────────────────────────────────────────────────────┘│
│                                         │ Other registered providers (3)                          ▾ │
│                                         │  [Gk] Grok          ◌ Sign-in not verified    Check again › │
│                                         │  [Ag] Antigravity   ○ Disabled                Enable      › │
│                                         │  [Oc] OpenCode      ◌ Not verified yet        Check again › │
│                                         │  [+ Add a provider]                                        │
│                                         ├────────────────────────────────────────────────────────────┤
│                                         │ Checks never send a paid request.     Provider Settings →  │
└─────────────────────────────────────────┴────────────────────────────────────────────────────────────┘
```

`┃` marks the 2px leading rule on cards that need attention. `[Cx]`-style tiles stand for `ProviderInstanceIcon`; real marks are never recolored.

**Regions:**

1. **Header.** Title "Provider connections" (`type-title`). "Check all" (outline, `RefreshCw`) calls `server.refreshProviders` once per enabled instance; each card shows its own spinner. Close.
2. **Scope row.** "Execution host" menu listing every environment with its connection dot and a cloud icon when remote. Beside it, the access chip: "Manage access" (neutral) or "Read-only · sign-in needs Manage access" (`Lock`). Everything below is scoped to this host.
3. **Triage strip.** A single-select toggle group: All, Ready, Needs attention, Not verified, each with a count ([states §1.6](INTERACTION_STATES.md#16-composite-connection-status-proposed-e3)). It filters the list and never reorders it. Disabled instances are not counted.
4. **Primary providers.** Codex, Cursor and Claude in that **fixed** order, one card per configured instance. A missing primary driver renders a muted "Not set up on {host}" card with "Add {Provider}" (existing `AddProviderInstanceDialog`, preselected).
5. **Other registered providers.** Every other configured instance, including Grok, Antigravity, OpenCode and custom instances, as compact rows in a collapsible group. Collapsed by default unless one of them needs attention. "Add a provider" ends the group.
6. **Footer.** "Checks never send a paid request." and "Provider Settings →".

**Fixed order beats status sorting.** Cards never jump when a check finishes. The triage strip, the rule and the badge carry status.

#### Card anatomy (`ProviderConnectionCard`)

| Slot                      | Content                                                                                             | Source                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Identity                  | 32px mark, display name (`type-label`), instance label when a driver has several instances          | `ProviderInstanceIcon`, instance config                 |
| Sub-line                  | Vendor · mechanism · "on {host}" (`type-meta`). Cloud icon when remote                              | Driver metadata, environment descriptor                 |
| Status                    | Group dot + label ([states §1.6](INTERACTION_STATES.md#16-composite-connection-status-proposed-e3)) | `deriveProviderConnectionStatus`                        |
| Primary action            | One outline button, or none                                                                         | Same                                                    |
| Fact grid (3 × 2)         | Sign-in · Account · Billing (reported) · Model · Runtime · Last check                               | E1 facts and `billingRoute`; `verifiedAt` relative time |
| Advisory chips (optional) | Update available · API billing · Last sign-in: {outcome}                                            | `versionAdvisory`, `billingRoute`, last E2 outcome      |
| Open detail               | The whole header is the detail button (chevron)                                                     | —                                                       |

Every fact cell is label (`type-meta`, muted) over value (`type-body-compact`) with its icon. Account values use `RedactedSensitiveText`. "Last check" reads "1 min ago" when fresh, "checked 12 min ago · expired" when stale and "Never" otherwise.

### 2.3 Provider detail (screen B)

Pushed inside the sheet. A back button returns to the overview with focus on the originating card.

```
┌ ‹ All providers ─────────────────────────────────────────────────── [✕] ┐
│ [Cx]  Codex                                                  ● Ready    │
│       OpenAI · instance codex · v{version} · on This Mac                │
│ ┌ Status ─────────────────────────────────────────────────────────────┐ │
│ │ Ready. Preflight passed 1 min ago. A completed turn isn't verified. │ │
│ │                                                      [Check again]  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ Account and sign-in                                                     │
│   Signed in as ••••@•••• · ChatGPT account (reported)                   │
│   Sign-in method   Official Codex App Server · browser or device code   │
│   [Sign in again]                                                       │
│ Readiness                                              checked 1 min ago │
│   Driver                     ✓ Driver available                          │
│   Executable                 ✓ Installed · v{version}                    │
│   Sign-in                    ✓ Signed in                                 │
│   Account identity           ✓ Verified                                  │
│   Subscription entitlement   ◌ Not verified                              │
│   Selected model             ✓ {model} available                         │
│   Runtime preflight          ✓ Preflight passed                          │
│ Billing                                                                 │
│   Route        Subscription · reported by Codex                         │
│   Plan label   {label} · reported by Codex                              │
│   Entitlement and remaining usage aren't verified.      View usage →    │
│ ▸ Diagnostics                                                           │
│ Open in Provider Settings →                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

Sections, top to bottom:

1. **Identity header.** Mark, name, vendor, instance ID, version, host. Group status on the right.
2. **Status panel.** The composite headline in one sentence plus **the** next action. While an attempt runs, the ceremony ([§2.4](#24-sign-in-flows-screen-c)) replaces this panel. This is the only place in the sheet with a solid violet button.
3. **Account and sign-in.** Account identity (redacted), the sign-in mechanism from the E2 capability, and "Sign in again" (secondary) when already signed in and a ceremony is advertised. Without `access:write`: "Needs Manage access" with `Lock`.
4. **Readiness.** All seven E1 facts as a definition list, using the fact copy in [states §1.1](INTERACTION_STATES.md#11-e1-readiness-facts-delivered). Reuses the facts and copy behind the existing `ProviderReadinessDetails`.
5. **Billing.** Route with "reported by {Provider}", plan label (detail only), the fixed entitlement line, and "View usage →" to the existing Usage page. Cursor adds "X Subscription migration: Unknown". Claude adds the [F4 caveat](INTERACTION_STATES.md#143-claude-guided-terminal).
6. **Diagnostics** (collapsed). Driver kind, instance ID, executable path, inspection status and `verifiedAt`, model catalog source, E2 capability and ceremonies, the last lifecycle reason code with its fixed text, version advisory. "Copy diagnostics" copies this list as text. It never includes the account email, login URLs, codes or attempt IDs.
7. **Open in Provider Settings →.**

### 2.4 Sign-in flows (screen C)

The ceremony replaces the detail's status panel. Steps, copy and outcomes are in [states §1.4](INTERACTION_STATES.md#14-provider-specific-sign-in). Every waiting step shows the expiry countdown in the panel header (`role="timer"`, tabular numerals, not announced each second).

**Codex, browser handoff:**

```
┌ Sign in to Codex                                          Expires in 4:12 ┐
│ ① Open the ChatGPT sign-in page                                          │
│    [Open ChatGPT sign-in ↗]   auth.openai.com                            │
│ ② Finish signing in there. This page updates by itself.                  │
│    ⧗ Waiting for you…                                                     │
│ Browser not on This Mac?  Use a device code instead                      │
│                                                                [Cancel]  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Codex, device code:**

```
┌ Sign in to Codex with a device code                       Expires in 4:40 ┐
│ ① Open the verification page on any device                               │
│    [Open verification page ↗]   auth.openai.com                          │
│ ② Enter this code                                                        │
│    ┌────────────────────┐                                                │
│    │  ••••-••••         │   [Show code]  [Copy]                          │
│    └────────────────────┘                                                │
│    Enter it only at auth.openai.com. Don't share it.                     │
│    ⧗ Waiting for you…                                         [Cancel]   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Cursor, official CLI handoff:**

```
┌ Sign in to Cursor                                         Expires in 4:51 ┐
│ Nebula runs Cursor's official login with this executable on This Mac:    │
│    /usr/local/bin/{cursor executable}                            [Copy]  │
│ ① [Open Cursor sign-in ↗]   cursor.com                                   │
│ ② Finish signing in there. This page updates by itself.                  │
│    ⧗ Waiting for you…                                         [Cancel]   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Claude, guided terminal:**

```
┌ Sign in to Claude from your terminal                      Expires in 4:48 ┐
│ Claude sign-in runs in your own terminal. Nebula doesn't open Claude     │
│ OAuth or collect tokens.                                                 │
│ ① Open a terminal on This Mac                                            │
│ ② Use this instance's executable and configuration                       │
│    Executable          {binaryPath}                              [Copy]  │
│    CLAUDE_CONFIG_DIR   {homePath} │ Default (not set)            [Copy]  │
│ ③ Run  auth login  with that executable                                  │
│ ④ Finish the prompts in your terminal and browser                        │
│ ⑤ [Check sign-in status]                                                 │
│ ⓘ Your Claude plan's use in third-party apps depends on Anthropic's      │
│   current terms. Nebula doesn't verify entitlement or usage.             │
│                                                         [Stop tracking]  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Success (all providers):**

```
┌ ✓ Signed in to Codex on This Mac ────────────────────────────────────────┐
│ Account ••••@••••                                                        │
│ Sign-in doesn't settle these. They update as the fresh check arrives:    │
│   Selected model             ✓ {model} available                         │
│   Subscription entitlement   ◌ Not verified                              │
│   Runtime preflight          ✓ Preflight passed                          │
│ Signing in doesn't guarantee a model or included usage.                  │
│                                       [View readiness]   [Done]          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Recovery states (screen D)

All twenty states, with copy and actions, are in [states §1.5](INTERACTION_STATES.md#15-recovery-states). Placement:

| Where                                  | States                                                                                                                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope banner** (under the scope row) | Disconnected remote host (#12), Older host (#17)                                                                                                                                                                 |
| **Card** (label + primary action)      | Not installed, Sign-in required, Waiting for you, Starting sign-in, Verification needed, Sign-in expired, API credential overrides sign-in, Disabled, Driver unavailable, Model not offered, Needs Manage access |
| **Detail status panel**                | All of the above with their full message, plus Successful authentication, Cancelled, Failed, Unsupported configuration, Environment changed, Instance unavailable, Stale attempt                                 |

A recovery panel is a `ui/alert` with icon, title (`type-label`), one or two sentences, the primary action and at most one secondary action. Tone follows [states §1.3](INTERACTION_STATES.md#13-e2-authentication-lifecycle-delivered). Permission uses `Lock` and neutral tone, never error.

### 2.6 Information hierarchy

1. Which execution host, and whether Nebula can reach and manage it.
2. Triage counts: ready, needs attention, not verified.
3. Primary providers in fixed order, each with status and one next action.
4. Per-provider facts: sign-in, account, billing (reported), model, runtime, last check.
5. Other registered providers.
6. Detail: next action first, then account, readiness, billing, diagnostics.

### 2.7 Component inventory

| Component                                | Status                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `ProviderConnectionsSheet`               | Proposed (`ui/sheet`, wider variant)                                                |
| `ProviderConnectionsOverview`            | Proposed                                                                            |
| `ProviderTriageStrip`                    | Proposed (`ui/toggle-group`)                                                        |
| `ProviderConnectionCard` / compact row   | Proposed (composes `ProviderInstanceIcon`, `RedactedSensitiveText`)                 |
| `ProviderFactGrid` / `ProviderFactList`  | Proposed (one fact-copy module shared with `ProviderReadinessDetails`)              |
| `ProviderConnectionDetail`               | Proposed                                                                            |
| `ProviderSignInPanel` and ceremony steps | Proposed (logic extracted from the delivered `ProviderAuthenticationControls`)      |
| `PrivateCodeDisplay`, `AttemptCountdown` | Proposed                                                                            |
| `ProviderRecoveryNotice`                 | Proposed (`ui/alert`)                                                               |
| Environment menu                         | Existing pattern (devices picker in `ProviderSettingsPanel`, `ConnectionStatusDot`) |
| Update action                            | Existing (`server.updateProvider`, update popover)                                  |
| Add provider                             | Existing (`AddProviderInstanceDialog`)                                              |
| Usage link                               | Existing (`/usage`)                                                                 |

Full specifications: [COMPONENT_SPECIFICATIONS.md §3](COMPONENT_SPECIFICATIONS.md#3-provider-connections-components).

### 2.8 Primary interactions

- **Open.** Any entry point. If the chosen host is connected, the sheet calls `status` once per enabled instance (with `access:write` and the capability) and `server.refreshProviders` once per enabled, **stale** instance (with `orchestration:operate`), at most once per opening and never more often than every 60s ([founder decision F13](SUPER_ADE_DESIGN_CONTRACT.md#15-founder-decisions)).
- **Check all / Check again.** `server.refreshProviders`, per instance. The card keeps its last value muted, with a spinner and `aria-busy`, until the new snapshot arrives.
- **Sign in.** Opens the detail at its ceremony and calls `begin` with the chosen ceremony.
- **Cancel / Stop tracking.** `cancel` with the current `attemptId`. Never logs out.
- **Switch host.** Re-scopes everything. It discards ceremony views for the previous host; their attempts continue on that host until they end or expire.
- **Enable.** The existing provider update path (`server.updateProvider`, `orchestration:operate`).

### 2.9 Loading, empty and error states

| State                                     | Treatment                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| First load                                | Three primary card skeletons at final height (164px), one 40px row per other instance                  |
| Snapshot not yet received for an instance | Facts "Not verified", label "Not verified yet", "Checking…" while a refresh runs                       |
| Checking (user-initiated)                 | Card spinner, `aria-busy`, last values muted                                                           |
| `begin` slow                              | "Preparing sign-in…" then, after 10s, "Still checking {Provider} on {host}…"                           |
| Lifecycle RPC failure                     | Inline "Status unavailable. Reconnect and retry." No cause text. Ceremony data dropped                 |
| No enabled providers on host              | `ui/empty`: "No providers enabled on {host}", with the registered drivers listed and "Enable" or "Add" |
| Host disconnected                         | Scope banner with Reconnect. Facts "Not verified" with "Last checked before disconnect: {time}"        |
| Read-only client                          | Access chip "Read-only". Sign-in actions replaced by "Needs Manage access". Facts and Check again stay |

### 2.10 Responsive and appearance

| Viewport                        | Container                                                                           | Overview                                                                                                               | Detail and ceremonies                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **1440 desktop**                | 600px right sheet (`--connections-sheet-width`), scrim over the shell               | Fact grid 3 × 2. Primary action beside the status                                                                      | Push inside the sheet                                                                                                  |
| **1280 laptop**                 | 560px sheet                                                                         | Fact grid 3 × 2 with 12px gaps. When the header is too narrow, the primary action moves under the sub-line             | Push inside the sheet                                                                                                  |
| **390 narrow** (< 768)          | Full-screen sheet. Header: back/close and title. "Check all" moves to a `⋯` menu    | Host menu full width. Triage strip scrolls horizontally. Fact grid 2 × 3. Primary action full width at the card's foot | Full-screen push. Sticky footer holds the ceremony's primary action. Device code wraps; the code block keeps 22px mono |
| **Wide and ultrawide** (≥ 1920) | 1000px two-pane sheet (`--connections-sheet-width-wide`): list 400px · detail 600px | Compact cards (fact grid hidden; status, billing chip and last check only)                                             | Always visible beside the list. No push. Nothing stretches beyond 1000px; the project stays visible to the left        |

At every width: no horizontal scroll, 44px hit areas under `pointer: coarse`, and the countdown never wraps away from its label.

**Dark and light.** Built from theme roles only, so every built-in and custom theme works. Target rendering is `nebula-ion` ([DESIGN_TOKENS.md §3](DESIGN_TOKENS.md#3-nebula-ion-role-values)); E3 does **not** change the default theme.

| Element                     | Role (dark and light)                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Sheet                       | `surfaceOverlay`, `border` on the leading edge, `radius-xl`, overlay shadow                               |
| Card                        | `surface`, `border`; hover `surfaceRaised`; selected (wide two-pane) `accentSurface` + 2px `primary` rule |
| Attention rule              | 2px leading rule in `error`, `warning` or `info`                                                          |
| Fact label / value          | `textMuted` / `text`                                                                                      |
| Status icon                 | `success` / `error` / `warning` / `info` / `iconMuted`                                                    |
| Triage chip selected        | `accentSurface` + `aria-pressed`                                                                          |
| Code block, executable path | `codeBackground`, `codeForeground`, `type-mono`                                                           |
| Device code                 | `codeBackground`, `type-mono-display`                                                                     |
| Ceremony primary            | `messageAction` (the sheet's only solid violet control)                                                   |
| Recovery panels             | `errorSurface`, `warningSurface`, `infoSurface` with matching foregrounds                                 |

### 2.11 Keyboard and focus

- **Open:** focus goes to the first card that needs attention (its primary action), otherwise to the sheet title.
- **Tab order:** header → scope row → triage strip → each card (detail button, then primary action) → other providers → footer.
- **Detail:** focus moves to the provider name heading. Back (button, or `Alt+←` / `⌘[` while the sheet has focus) returns focus to the originating card.
- **Ceremonies:** after `begin` resolves, focus moves to the step's first action ("Open ChatGPT sign-in", "Show code", "Check sign-in status"). After success, focus moves to "Done".
- **Esc** closes the sheet and returns focus to the launcher. Esc never cancels an attempt.
- **Triage strip:** one Tab stop, arrow keys between options.
- **Live regions:** polite for "Checking…" results, ceremony progress and success; assertive for failure and expiry; one polite "Sign-in expires in 1 minute".

### 2.12 Motion

- Sheet enter and exit `--motion-sheet`. Detail push: 16px slide plus fade (`--motion-sheet`).
- Status and fact changes crossfade (`--motion-fast`). A headline that changes after a user-initiated check highlights the card once (`accentSurface`, 600ms).
- The `signing-in` dot uses the existing duty-cycled status pulse. Nothing else loops. The countdown changes text only.
- Reduced motion: no slide, no pulse, no highlight; announcements still fire.

### 2.13 Visual acceptance criteria

- [ ] Every synthetic fixture in [states §1.8](INTERACTION_STATES.md#18-synthetic-fixtures) renders its expected group, label and primary action.
- [ ] No card is "Ready" unless E1 `runtime` is `verified`. Stale instances read "Verification expired" in neutral tone and are not counted as Needs attention.
- [ ] Billing always says "reported". API billing is visually distinct. Entitlement always reads "Not verified" today.
- [ ] No sign-in path implies OAuth inside Nebula. Claude shows terminal steps only.
- [ ] Login URLs never render in full. Device codes are masked until "Show code".
- [ ] Reconnecting, switching host and replacing an instance clear every ceremony view.
- [ ] Without `access:write`, facts are visible and no sign-in control renders.
- [ ] One solid violet control at most is visible in the sheet.
- [ ] 1440, 1280, 390 and ≥1920 layouts match [§2.10](#210-responsive-and-appearance) in dark and light, with no horizontal scroll.

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
