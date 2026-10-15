# Super ADE interaction states

**Status:** Proposed. Defines every state the Super ADE surfaces must render, how each is derived from existing data, and its exact presentation. Engineers implement these as pure derivation functions with table-driven tests. Components render only the derived result.

## 1. Provider readiness

### 1.1 Facts, not a single status

A provider instance on a given environment is described by **seven independent facts**. Each fact resolves to one of five levels.

| Level       | Meaning                                                          | Icon (Lucide)  | Tone        | Text style    |
| ----------- | ---------------------------------------------------------------- | -------------- | ----------- | ------------- |
| `met`       | Evidence says this is satisfied                                  | `CircleCheck`  | `success`   | Normal        |
| `attention` | Usable but degraded, or will need action soon                    | `CircleAlert`  | `warning`   | Normal        |
| `blocked`   | Prevents execution until resolved                                | `CircleX`      | `error`     | Medium weight |
| `unknown`   | Nebula has no evidence either way                                | `CircleDashed` | `iconMuted` | Muted         |
| `n/a`       | Fact does not apply (provider disabled, or earlier fact blocked) | `Minus`        | `iconMuted` | Muted         |

Every level always renders icon **and** text. Color is never the only cue.

### 1.2 Derivation from existing `ServerProvider` fields

Source: `packages/contracts/src/server.ts`. "V1" means implementable today without backend changes.

| #   | Fact                   | `met` when                                                                      | `attention` when                                                                      | `blocked` when                                                                                                                                                         | `unknown` when                                     | V1?                                                                                                     |
| --- | ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 0   | **Enabled** (gate)     | `enabled`                                                                       | —                                                                                     | — (disabled renders the whole row as Disabled, all facts `n/a`)                                                                                                        | —                                                  | Yes                                                                                                     |
| 1   | **Installed**          | `installed && version`                                                          | —                                                                                     | `!installed` ("CLI not detected on PATH")                                                                                                                              | snapshot not yet checked                           | Yes                                                                                                     |
| 2   | **Compatible**         | `versionAdvisory.status === "current"` and no compatibility error in `message`  | `versionAdvisory.status === "behind_latest"` (update available)                       | Server reports the version is too old for a required protocol (today only in `message` text). **Proposed:** a typed `compatibility` field so the UI never parses prose | `versionAdvisory` absent or `status === "unknown"` | Partial (blocked case needs typed field; until then show `message` verbatim under an `attention` level) |
| 3   | **Authenticated**      | `auth.status === "authenticated"`                                               | —                                                                                     | `auth.status === "unauthenticated"`                                                                                                                                    | `auth.status === "unknown"`                        | Yes                                                                                                     |
| 4   | **Account identified** | `auth.email` or `auth.label` present on this check                              | —                                                                                     | —                                                                                                                                                                      | authenticated but no identity reported             | Yes                                                                                                     |
| 5   | **Billing route**      | Mapped via [§1.3](#13-billing-route-mapping-v1)                                 | Route = API billing (shown, not a problem, but consequential)                         | —                                                                                                                                                                      | Unmapped `auth.type`/`auth.label`                  | Yes (mapping table)                                                                                     |
| 6   | **Model available**    | Selected or default model is in `models` and not disabled                       | Selected model is custom (`isCustom`) or legacy (`isLegacy`): "unverified" / "legacy" | Selected model absent from `models`                                                                                                                                    | `models` empty while authenticated                 | Yes                                                                                                     |
| 7   | **Ready to execute**   | `status === "ready"` and facts 1, 3 and 6 are `met`, plus environment connected | `status === "warning"`, or `availability === "unavailable"` with a transient reason   | Any of facts 1, 3 or 6 `blocked`, or `status === "error"`, or environment disconnected                                                                                 | Fact 3 `unknown`                                   | Yes                                                                                                     |

**Rule:** Ready-to-execute `met` is labelled **"Ready"** with sub-text **"Not yet used here"** unless this instance has completed a turn in this environment during the current server session. If that evidence is not cheaply available, always show the sub-text. **Never** trigger inference to turn a fact green.

### 1.3 Billing route mapping (V1)

The snapshot has no typed billing field. Plan information arrives in `auth.type`/`auth.label` strings produced per driver. V1 maps **only** the values below, per driver. Anything else is `unknown`. **Proposed for audit PR 1:** a typed `billingRoute: "subscription" | "api" | "cloud" | "unknown"` plus an optional `planLabel`, which replaces this table.

| Driver                    | Reported value (exact source)                                                                                                                         | Display                                           | Level                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------- |
| `codex`                   | `auth.label` ∈ "ChatGPT {Free, Go, Plus, Pro 20x, Pro 5x, Team, Business, Enterprise, Edu} Subscription" (`CodexProvider.ts` `codexAccountAuthLabel`) | "Subscription · {label}"                          | `met`                             |
| `codex`                   | `auth.label === "ChatGPT Subscription"` (plan `unknown`)                                                                                              | "Subscription · plan not reported"                | `met`                             |
| `codex`                   | `auth.label === "OpenAI API Key"`                                                                                                                     | "API billing · OpenAI API key"                    | `attention`                       |
| `codex`                   | `auth.label === "Amazon Bedrock"`                                                                                                                     | "Cloud billing · Amazon Bedrock"                  | `attention`                       |
| `claudeAgent`             | `auth.type === "apiKey"` (label "Claude API Key")                                                                                                     | "API billing · Anthropic API key"                 | `attention`                       |
| `claudeAgent`             | `auth.type === "bedrock"`                                                                                                                             | "Cloud billing · Amazon Bedrock"                  | `attention`                       |
| `claudeAgent`             | any other `auth.type` with a `label` (provider-reported `subscriptionType`, `ClaudeProvider.ts` `formatClaudeSubscriptionAuthLabel`)                  | "Subscription · {label} · reported by Claude CLI" | `met`, plus info note (see below) |
| `cursor`                  | `auth.label` ending "Subscription" as produced by `CursorProvider` (for example "Cursor Team Subscription")                                           | "Subscription · {label}"                          | `met`                             |
| `grok`                    | `auth.status === "unknown"` (current behavior)                                                                                                        | "Not reported"                                    | `unknown`                         |
| `antigravity`, `opencode` | —                                                                                                                                                     | "Not reported"                                    | `unknown`                         |

**Claude info note** (founder decision F4), shown in provider detail only, not in rows:

> Plan reported by the Claude CLI. Whether third-party apps may use plan limits is set by Anthropic's terms for your account. Nebula doesn't verify entitlement.

API and cloud billing get `attention`. This is not an error. It flags a money consequence. The composer shows the route in the model picker for these instances.

### 1.4 Overall row summary

The row headline is the **first non-met fact in ladder order**. That makes the next action obvious.

| First non-met fact     | Headline                             | Primary action                                              |
| ---------------------- | ------------------------------------ | ----------------------------------------------------------- |
| (disabled)             | "Disabled in Nebula"                 | Enable (existing switch)                                    |
| Installed: blocked     | "Not installed"                      | "How to install" (official docs link)                       |
| Compatible: blocked    | "Update required: {current} → {min}" | "Update" (existing `server.updateProvider`) or copy command |
| Authenticated: blocked | "Sign in required"                   | "Sign in…" (guided handoff, [§1.6](#16-sign-in-handoff-v1)) |
| Authenticated: unknown | "Sign-in not verified"               | "Check again"                                               |
| Model: blocked         | "Selected model unavailable"         | "Choose model"                                              |
| Ready: attention       | "Limited: {reason}"                  | "Check again"                                               |
| Compatible: attention  | "Ready · update available"           | "Update" (secondary)                                        |
| all met                | "Ready" + "{account} · {route}"      | none (row click opens detail)                               |

### 1.5 Observed states (from the running client, accounts redacted)

These real snapshots must render correctly. Use them as fixtures in tests.

| Instance    | Snapshot facts                                                                                     | Expected headline                                             | Expected ladder                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Codex       | installed, authenticated, label "ChatGPT Pro 20x Subscription", update advisory present            | "Ready · update available"                                    | Installed ✓ · Compatible ⚠ (update) · Auth ✓ · Account ✓ · Billing ✓ Subscription · Model ✓ · Ready ✓ |
| Claude      | installed, authenticated, label "Claude Max Subscription"                                          | "Ready"                                                       | … Billing ✓ "Subscription · Claude Max · reported by Claude CLI"                                      |
| Cursor      | installed (old version), `message` says CLI too old for ACP model picker **and** not authenticated | "Update required" (first blocker); sign-in shown as next step | Installed ✓ · Compatible ✗ · Auth ✗ · Account – · Billing – · Model – · Ready ✗                       |
| Grok        | installed, `auth.status: "unknown"`, status available                                              | "Sign-in not verified"                                        | Installed ✓ · Compatible ? · Auth ? · Account ? · Billing ? · Model ✓ · Ready ?                       |
| Antigravity | disabled                                                                                           | "Disabled in Nebula"                                          | all `n/a`                                                                                             |

### 1.6 Sign-in handoff (V1)

There is **no** login RPC today. V1 is an honest guided handoff:

1. The detail view shows **"How sign-in works for {Provider}"** with the official mechanism, worded per provider:
   - **Codex:** "Signs in with your ChatGPT account through the Codex CLI. A browser window opens."
   - **Cursor:** "Signs in through the Cursor Agent CLI (`agent login`). A browser window opens."
   - **Claude:** "Signs in through the Claude CLI. Follow the prompts in the terminal."
   - **Grok:** "Signs in through the Grok CLI, or uses an xAI API key you configure."
2. Show the command in a mono code block with **Copy**. Command text comes from the server's own remediation text where available. Do not hard-code CLI flags.
3. **"Open terminal in {environment}"** opens a Nebula terminal on that environment. If a "prefill without running" capability exists, the command is typed but **not executed**. Otherwise the terminal opens empty and the command stays copyable. _(Codex verifies which is possible. Auto-running login is not allowed.)_
4. **"I've signed in — check again"** calls `server.refreshProviders({instanceId})` and shows `Checking…` (spinner, `aria-busy`). A polite live region announces the new headline.
5. If still unauthenticated: "Still not signed in. Make sure the sign-in finished in {terminal/browser}." Offer Retry.

**Future (audit PR 2): typed `begin`/`status`/`cancel`.** The same screen gains these states:

| State          | UI                                                           | Notes                                                                            |
| -------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Authenticating | Step shows "Waiting for {Provider} sign-in…" with **Cancel** | Device code or URL, if any, shown once, never logged; "Open sign-in page" button |
| Cancelled      | "Sign-in cancelled" + Retry                                  | —                                                                                |
| Expired        | "Sign-in timed out" + Retry                                  | —                                                                                |
| Succeeded      | Auto-refresh. Announce "{Provider} connected as {account}"   | —                                                                                |

### 1.7 Logout

Not offered in V1. When added: confirmation dialog stating "This signs {Provider} out on {environment} for every app that uses the {Provider} CLI, not just Nebula."

## 2. Execution context states

States for the proposed **Execution Context Chip** and **Context popover**. Data: thread/Task workspace resolution and VCS status (existing contracts).

| State                    | Chip rendering                                             | Popover adds                                                                               | Tone                               |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| Loading                  | Fixed-width skeleton (`w-48`), no layout shift             | —                                                                                          | neutral                            |
| Current checkout         | `⎇ main · Current checkout`                                | HEAD SHA, dirty count, ahead/behind, path                                                  | neutral                            |
| Worktree                 | `⎇ feat/x · worktree feat-x`                               | worktree path (start-truncated), created-by (Task/thread)                                  | neutral                            |
| Task worktree            | `⎇ nebula/task-42 · Task: Add notes API`                   | Task status, ownership summary, link to Task inspector                                     | neutral                            |
| Remote environment       | `☁ devbox ▸ ⎇ main · Current checkout`                     | host label, connection status (`ConnectionStatusDot`)                                      | neutral; cloud icon always visible |
| Dirty                    | adds `● 3` after branch                                    | changed/untracked counts, "Open Diff"                                                      | neutral (dirty is normal)          |
| Branch mismatch          | `⚠ ⎇ feat/x ≠ HEAD main`                                   | explanation + "Open worktree for feat/x"                                                   | warning                            |
| Detached HEAD            | `⎇ detached @ a1b2c3d`                                     | SHA, "Create branch here…"                                                                 | warning                            |
| Missing worktree         | `⚠ worktree missing`                                       | recorded path; "Recreate worktree" (existing Task restore path only); "Start a new thread" | error                              |
| Environment disconnected | `⛔ devbox offline`                                        | last seen; reconnect hint                                                                  | error                              |
| Not a Git repository     | `Folder · not a Git repository`                            | "Initialize…" is **not** offered from here                                                 | neutral                            |
| Draft (unlocked)         | Chip hidden in toolbar; composer context strip is editable | —                                                                                          | —                                  |

## 3. Session and surface identity

| Surface               | Title                  | Sub-label                                       | Icon                                   |
| --------------------- | ---------------------- | ----------------------------------------------- | -------------------------------------- |
| Chat (thread)         | Thread title           | `{Provider mark} {model}`                       | provider mark                          |
| Shell terminal        | "Shell" or custom name | `{env} · {worktree label}`                      | `SquareTerminal`                       |
| Provider CLI terminal | "{Provider} CLI"       | "Separate session, not linked to this chat"     | provider mark + `SquareTerminal` badge |
| Dev server pane       | script name            | "Started by Nebula" / "Discovered" / "Attached" | `Server`                               |
| Preview               | page title or host     | `localhost:5173` + "on {env}" when remote       | favicon / `Globe`                      |
| File editor           | file name              | worktree label + "Unsaved" / "Saved"            | file icon                              |
| Diff                  | "Changes"              | scope "Branch" / "Unstaged" / "Task"            | `GitCompare`                           |

Linked Chat ↔ Terminal layouts show a `Link2` glyph with the tooltip "Shown together. Conversations are separate."

## 4. Context switching

Switching the **checkout** of a mutable workspace is guarded. Opening a different worktree is always safe and preferred.

```
User picks branch X in Branches view or branch selector
        │
        ├─ X already checked out in a worktree W? ──► Offer "Open W" (primary). No mutation.
        │
        ├─ Current workspace belongs to a Task? ────► Block: "Task worktrees keep their branch."
        │                                              Offer "Open X in a new worktree".
        │
        └─ Otherwise run pre-checks (fresh, server-side):
              • active provider sessions on this checkout
              • running terminals / dev servers
              • dirty or untracked files
              • unpublished commits
                    │
                    ├─ all clear ──► Confirm dialog: "Switch {checkout} from A to X" ─► revalidate ─► switch
                    └─ any found ──► Dialog lists each blocker with its own link.
                                     Primary: "Open X in a new worktree".
                                     No automatic stash, kill or discard. "Switch anyway" is not offered.
```

The confirm dialog repeats the **environment and path** being changed. After the switch, a toast says "Switched {checkout} to X" with the new HEAD SHA.

## 5. Composer states

### 5.1 Intent availability

| Intent       | Enabled when                                    | Disabled reason text                                                                     |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Chat         | provider Ready (`met` or `attention`)           | "{Provider} isn't ready: {headline}" + "Fix" link to Connections                         |
| Analyze      | provider exposes an enforced read-only mode     | "{Provider} can't enforce read-only here. Use Supervised access to approve each action." |
| Task         | Git repository present; provider ready          | "Tasks need a Git repository" / provider reason                                          |
| Mission plan | clean baseline (existing check); provider ready | "Commit or stash changes first. Mission plans start from a clean baseline."              |

Changing intent never clears the draft. Intent persists per draft, not globally.

### 5.2 Primary action states (existing `ComposerPrimaryActions`, restyled)

| State                     | Visual                                                          | `aria-label` (existing strings preserved)                       |
| ------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Idle, empty draft         | Violet button at 40% emphasis, `disabled`                       | "Send"                                                          |
| Ready                     | Solid violet `messageAction`, arrow-up icon                     | "Send" / "Analyze" / "Create Task" / "Generate plan" per intent |
| Sending                   | Spinner replaces icon                                           | "Sending"                                                       |
| Preparing worktree        | Spinner + inline "Preparing worktree…"                          | "Preparing worktree"                                            |
| Connecting / disconnected | Neutral button, `WifiOff` icon                                  | "Connecting" / "Environment disconnected"                       |
| Running                   | Neutral square "Stop" (not violet; stop is not the primary act) | "Stop generation"                                               |
| Awaiting answers          | "Submit answer(s)"                                              | existing                                                        |
| Plan ready                | "Implement" + menu / "Refine"                                   | existing                                                        |

### 5.3 Pending panels

Approvals (`ComposerPendingApprovalPanel`) and questions (`ComposerPendingUserInputPanel`) keep their behavior. Design changes:

- Panel uses `warningSurface` for approvals and `infoSurface` for questions, with a 2px leading rule in the tone color.
- Title includes the request kind ("Command approval") and the **execution context** (worktree label) in meta text.
- Buttons order: Cancel · Decline · Always allow this session · **Approve** (primary). Destructive styling is never used for Decline.
- A polite live region announces "Approval needed: {kind}".

## 6. Save states (Notes, file editor)

| State             | Indicator (header, right)                     | Behavior                                                          |
| ----------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Clean             | none                                          | —                                                                 |
| Editing (unsaved) | `●` dot + "Unsaved" (`textMuted`)             | Navigating away prompts (existing `fileEditorDismissal`)          |
| Saving            | Spinner + "Saving…"                           | Input stays editable                                              |
| Saved             | `CircleCheck` + "Saved" for 2s, then clean    | Polite announcement only after a manual save                      |
| Save failed       | `CircleX` + "Couldn't save" + Retry (`error`) | Assertive announcement. Text is never discarded                   |
| Conflict          | `GitMerge` + "Changed elsewhere" (`warning`)  | Opens compare: Keep mine (new revision) / Take theirs / Copy mine |
| Read-only         | `Lock` + "Read-only"                          | Binary/large files, protected notes for agents                    |

## 7. Control interaction states

Token mapping for every interactive element. Values reference [DESIGN_TOKENS.md](DESIGN_TOKENS.md).

| State              | Primary (violet)                                                                         | Secondary / outline                             | Ghost (toolbar, sidebar row)                  | Tile / card                                  | Input                         |
| ------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------- | -------------------------------------------- | ----------------------------- |
| Default            | `bg-primary text-primary-foreground`                                                     | `bg-secondary border-border`                    | transparent                                   | `bg-surface-raised border-border`            | `bg-transparent border-input` |
| Hover              | `messageActionHover`                                                                     | `toolbarControlHover`                           | `sidebarRowHover` / `toolbarControlHover`     | border → `input`, surface → `surfaceOverlay` | border → `input` + 8% fg mix  |
| Pressed            | hover + `inset 0 1px rgb(0 0 0/8%)` (existing)                                           | darker by one surface step                      | `sidebarRowActive`                            | scale 0.99 (`--motion-instant`)              | —                             |
| Focus-visible      | 2px `ring` + 1px offset `background` (existing button primitive)                         | same                                            | same, inset ring inside sidebar               | same                                         | `--glow-focus`                |
| Selected / current | —                                                                                        | `accentSurface` + `aria-pressed`/`aria-current` | `sidebarRowSelected` + 2px leading violet bar | `accentSurface` border `primary` 45%         | —                             |
| Disabled           | 64% opacity (existing `disabled:opacity-64`), label still readable, tooltip gives reason | same                                            | same                                          | same + `cursor-not-allowed`                  | same                          |
| Loading            | spinner replaces leading icon; width locked                                              | same                                            | same                                          | skeleton                                     | —                             |

Selection always uses **surface + indicator** (bar, check or pressed state), never color alone.

## 8. Empty, loading and error patterns

**Empty states** (existing `ui/empty`):

- Icon (20px, `iconMuted`), a title of eight words or fewer, a one-sentence description, and at most two actions.
- Write them in product language: "No notes yet", not "Nothing here!"
- The hero treatment (display type plus static glow) is reserved for **Project Home with no threads**.

**Loading:**

- Skeletons (existing `ui/skeleton`, duty-cycled shimmer) match the final layout's dimensions.
- Spinners only inside buttons or for sub-second inline work.
- After 10 seconds, swap the skeleton for "Still loading {thing}…" with a Retry action.

**Errors:**

| Error class        | Pattern                                            | Example copy                                                           |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------- |
| Recoverable, local | Inline under the control, `error` text + icon      | "Couldn't read branches. Retry"                                        |
| Surface-level      | `ui/alert` inside the surface, with cause + action | "Preview is only available in the Nebula desktop app. Open in browser" |
| Permission         | Distinct `Lock` icon and wording; never "error"    | "You don't have permission to manage providers on this environment."   |
| Authentication     | Provider-specific; never generic                   | "{Provider} isn't signed in on {environment}."                         |
| Connection         | `WifiOff`, environment named                       | "devbox is offline. Work there is paused, not lost."                   |

Never show raw stack traces. Show server `message` text verbatim only inside a "Details" disclosure with a copy action.

## 9. Toasts and live regions

| Event                                    | Channel                               | Politeness         |
| ---------------------------------------- | ------------------------------------- | ------------------ |
| Provider check finished (user-initiated) | Inline status + live region           | polite             |
| Provider connected / sign-in failed      | Toast (5s) + live region              | polite / assertive |
| Approval needed (thread not focused)     | Sidebar pill (existing) + live region | polite             |
| Save failed                              | Inline + live region                  | assertive          |
| Context switched                         | Toast (4s)                            | polite             |
| Provider update progress                 | Existing update notifications         | polite             |

Toasts never carry the only copy of important information, and never include account emails or tokens.

## 10. Keyboard and focus model

**Existing shortcuts are preserved** (`packages/shared/src/keybindings.ts`): `mod+k` palette, `mod+p` files, `mod+shift+f` search, `mod+b` sidebar, `mod+j` terminal, `mod+alt+b` right panel, `mod+shift+j` preview, `mod+d` diff (outside terminal), `mod+shift+m` model picker, `mod+n` new thread, `mod+1…9` thread jump.

**Proposed new commands.** Register them in `DEFAULT_KEYBINDINGS`. **No default key unless it is conflict-free.** Default keys are a founder/Codex decision after a conflict check.

| Command id                       | Suggested key               | `when`           |
| -------------------------------- | --------------------------- | ---------------- |
| `providers.open`                 | none by default             | —                |
| `context.open` (Context popover) | none by default             | `!terminalFocus` |
| `composer.intent.next`           | `mod+shift+i` (verify free) | `composerFocus`  |
| `notes.new`                      | none by default             | `!terminalFocus` |
| `project.home`                   | none by default             | —                |

Focus rules:

- Dialogs and sheets trap focus and return it to the launcher on close.
- The tool tile grid uses arrow keys (existing `RightPanelEmptyState` behavior). Single-letter shortcuts (B/T/F/D/P/A) are active only while the grid has focus.
- The surface toggle group is one Tab stop with arrow-key navigation (`role="toolbar"`).
- Skip link "Skip to main content" is the first focusable element in the shell (proposed).
- The terminal owns all keys while focused except the documented escape chord (existing behavior).
