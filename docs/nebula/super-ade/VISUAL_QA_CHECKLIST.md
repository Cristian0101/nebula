# Super ADE visual QA checklist

**Status:** Proposed. Use this checklist for every Super ADE implementation step (D1–D9 in the [contract](SUPER_ADE_DESIGN_CONTRACT.md#16-engineering-implementation-handoff)). Check only the sections a change touches, and record in the PR which ones were checked and in which client (web or desktop).

Screenshots used as evidence must redact account emails (enable the existing redaction setting) and must never include pairing URLs, tokens, login URLs or device codes. Provider Connections evidence uses synthetic provider state only; real-account sign-in follows its own approved dogfood procedure.

## 1. Environments to check

| Item                                                        | Required for                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| Web client (`vp run dev`, isolated `--home-dir`)            | Every UI step                                                  |
| Desktop client                                              | Preview, window chrome, traffic-light inset, `setTheme` bridge |
| Widths 375 / 390 / 768 / 980 / 1280 / 1440 / 1920 / 2560 px | Layout steps (390, 1280, 1440 and 2560 are required for E3)    |
| `nebula-ion` dark and light                                 | Every UI step                                                  |
| `nebula` (Solar), one other built-in, and one custom theme  | Token steps (D1) and any new surface                           |
| OS reduced motion on, plus the `.no-transitions` class      | Any animated change                                            |
| Keyboard only (no pointer)                                  | Every interactive change                                       |
| Screen reader smoke pass (VoiceOver)                        | New components                                                 |

## 2. Tokens and theme (D1)

- [ ] `nebula-ion` appears in Appearance with dark and light variants. Selecting it applies every role, with no unset `--app-theme-*` variables (inspect computed styles).
- [ ] Fresh profile (no `t3code:theme`) opens in `nebula-ion`. A profile with `t3code:theme = "nebula"` still opens in coral and is labelled "Nebula Solar".
- [ ] A custom theme without the new `success*`/`info*` roles renders exactly as before.
- [ ] Contrast assertions from [DESIGN_TOKENS.md §3.1](DESIGN_TOKENS.md#31-contrast-audit) exist in `themePalette.test.ts` and pass.
- [ ] `rg "oklch\(|#[0-9a-fA-F]{3,8}\b" apps/web/src/components` shows no new literals in touched files.
- [ ] Thread status pills, AgentsPanel dots and provider dots use semantic tokens (no `sky-`/`emerald-`/`amber-400` utilities in touched files).
- [ ] Theme halves, glass opacity and typography overrides still work.

## 3. Global shell

- [ ] Exactly one sidebar, one toolbar, one context panel and one terminal floor. No duplicate mode bar.
- [ ] Sidebar width persists, respects the 208px minimum, and keeps main content ≥640px.
- [ ] The brand header shows the mark, "Nebula" and "Super ADE" (hidden when the sidebar is under 232px). Environment identification mode (artwork/pill/none) is unchanged.
- [ ] The search hint shows the **resolved** palette shortcut, not a hard-coded `⌘K`.
- [ ] The active project sub-list shows only destinations that exist. Notes is hidden until available.
- [ ] `aria-current="page"` is on the current destination.
- [ ] `ProviderReadinessSummary` counts only enabled instances on the current environment, says "ready" only for E1 `runtime: verified`, and never counts stale instances as needing attention.
- [ ] `ConnectProvidersCta` appears only while an enabled primary provider needs attention for a fixable reason, never for stale or unverified ones. Dismissal persists per environment.
- [ ] No plan, seats, star-count or decorative "connected" widgets.

## 4. Execution context

- [ ] Every writable surface shows environment (when remote), project, branch and worktree without interaction.
- [ ] The chip renders a fixed-width skeleton while loading, with no toolbar layout shift.
- [ ] Each of the chip states in [INTERACTION_STATES.md §2](INTERACTION_STATES.md#2-execution-context-states) is reproducible with a fixture: mismatch, detached, missing, remote, disconnected.
- [ ] The popover has no direct branch-switch mutation.
- [ ] The composer context strip is editable in a draft and locked after the first send.
- [ ] Terminal panes show "Shell" or "{Provider} CLI · Separate session, not linked to this chat".
- [ ] Remote previews and terminals show the environment name.

## 5. Provider Connections (E3)

Reference: [blueprint §2](SCREEN_BLUEPRINTS.md#2-provider-connections), [states §1](INTERACTION_STATES.md#1-provider-readiness-and-authentication), [visual reference](reference/provider-connections.html), [E3 acceptance checklist](SUPER_ADE_DESIGN_CONTRACT.md#165-e3-acceptance-checklist).

**Data truthfulness**

- [ ] Each synthetic fixture in [states §1.8](INTERACTION_STATES.md#18-synthetic-fixtures) renders its expected group, label and primary action, in the card and in the detail.
- [ ] Facts show `verified` / `blocked` / `unknown` with icon and fact-specific text. No fifth level, no blank value.
- [ ] Stale (over five minutes) reads "Verification expired · checked {relative}" in muted tone and is not counted as Needs attention.
- [ ] Billing always says "reported". API billing uses the warning outline chip. Plan labels appear only in the detail. Entitlement reads "Not verified".
- [ ] After a successful sign-in, model availability, entitlement and runtime show their own live values; nothing turns green before the fresh snapshot.

**Ceremonies**

- [ ] Codex browser: host name only beside "Open ChatGPT sign-in"; countdown; Cancel; device code offered as the alternative and as primary on a remote host.
- [ ] Codex device code: masked `••••-••••` until "Show code"; Copy confirmation names the host; cleared on expiry.
- [ ] Cursor: the configured executable is shown; host name only; Cancel stops the attempt.
- [ ] Claude: numbered terminal steps; executable and `CLAUDE_CONFIG_DIR` from the instance; fixed `auth login`; "Check sign-in status"; "Stop tracking"; F4 caveat; no Nebula terminal button.
- [ ] All twenty recovery states in [states §1.5](INTERACTION_STATES.md#15-recovery-states) are reachable with fixtures and show one primary action.

**Privacy**

- [ ] No full login URL, device code, account email (when redaction is on) or attempt ID in the DOM outside the mounted ceremony, in the URL, in storage, in toasts, in the title or in the sidebar summary.
- [ ] Reconnect, host switch, permission loss and instance replacement clear ceremony views.

**Layout and appearance**

- [ ] 1440: 600px sheet over a visible shell. 1280: 560px sheet. 390: full screen, 2 × 3 fact grid, sticky ceremony action. 2560: 1000px two-pane sheet.
- [ ] No horizontal scroll at any required width; nothing stretches beyond 1000px.
- [ ] Dark and light `nebula-ion`, plus the current default theme and one custom theme, render without literals.
- [ ] At most one solid violet control visible in the sheet; card actions are outline.
- [ ] Cards keep their fixed order after a check; the triage strip filters only.

**Interaction**

- [ ] Focus lands on the first attention card's action (or the title), moves into the detail heading, into each ceremony's first action, then "Done"; Back and Esc restore focus correctly.
- [ ] Esc closes the sheet without cancelling an attempt; reopening resumes it.
- [ ] Without `access:write`: facts visible, no sign-in controls, `Lock` "Needs Manage access".
- [ ] Live regions: check results, progress, success, failure, one-minute warning, expiry.

## 6. Project Home

- [ ] An active project has no display hero. An empty project shows the hero with static glow only (no animation, no image request).
- [ ] The order matches the [blueprint hierarchy](SCREEN_BLUEPRINTS.md#12-information-hierarchy).
- [ ] Tabs render only for implemented destinations. There is no Commits tab.
- [ ] Tool tiles are the same component as the context-panel empty state, and letter shortcuts work only while the grid is focused.
- [ ] Each card's loading, empty and error states are reachable and correct.
- [ ] Laptop width moves tool tiles inline. At compact width, tabs scroll and the composer docks.

## 7. Workbench

- [ ] Surface toggle pressed states match reality after opening surfaces via the tab bar, palette and shortcuts.
- [ ] The preview on the web client shows the desktop-only state with an external-browser action.
- [ ] Closing a preview does not stop its server.
- [ ] Restored-but-missing resources show a warning. No command replays.
- [ ] Existing shortcuts (`mod+j`, `mod+alt+b`, `mod+shift+j`, `mod+d`, `mod+p`) still work and stay inert inside a focused terminal where scoped.

## 8. Composer

- [ ] The intent control is present. Each intent changes the primary label. The draft survives intent changes.
- [ ] Analyze is disabled with the reason when read-only is not enforced.
- [ ] Mission plan copy never mentions running or executing.
- [ ] The access level is visible in every intent. Full access keeps warning tone.
- [ ] The compact menu reads "Build/Plan" (label mismatch fixed) and includes Intent.
- [ ] The "+" attach menu maps only to existing context types.
- [ ] Approval panel button order and tones match [states §5.3](INTERACTION_STATES.md#53-pending-panels).

## 9. Agents

- [ ] Templates and external collaborators never show live dots.
- [ ] Native subagents appear only in `AgentsPanel`.
- [ ] Empty state links work. Stop requires confirmation.

## 10. Notes (when backend exists)

- [ ] Save state is always visible. Failure keeps the text. Conflict offers compare.
- [ ] The attach chip pins a revision. Agents cannot write a protected note through APIs.
- [ ] Category colors are paired with labels.

## 11. Branches and worktrees

- [ ] The current checkout is first.
- [ ] Switch is guarded, and "Open in new worktree" is the primary path when blocked.
- [ ] Remove is available only from the detail sheet after a fresh assessment. "Stale" is never adjacent to delete.
- [ ] Columns without backing data are hidden, not filled with placeholders.

## 12. Swarm

- [ ] Approve plan and Authorize run are separate, explicit, and not reachable via Enter-submit.
- [ ] Gated stages show their reason.

## 13. Accessibility (all steps)

- [ ] Every interactive element has a visible focus ring (ion, ≥3:1 against adjacent surfaces).
- [ ] Every status shows icon + text (or text via `aria-label` for dots).
- [ ] Tab order follows the visual order. No keyboard traps except intentional dialog traps.
- [ ] Dialogs and sheets restore focus to the launcher.
- [ ] Live regions announce: check results, sign-in progress and outcome, sign-in expiry, save failure, approvals.
- [ ] Text never goes below 12px except `type-micro` badges and kbd (11px).
- [ ] Touch (`pointer: coarse`) hit areas are ≥44px (existing button behavior preserved).

## 14. Motion and performance

- [ ] Only `opacity` and `transform` animate. Durations follow the tokens.
- [ ] Reduced motion removes transforms and keeps state announcements.
- [ ] Idle CPU after 30s on Project Home shows no continuous repaint (Performance panel: no recurring paint from decorative layers).
- [ ] Lists with more than 100 rows (branches, notes, agents) are virtualized or paginated.

## 15. Content

- [ ] Sentence case. No ALL-CAPS labels.
- [ ] No claim of connection, readiness, review, coverage or entitlement without a backing field.
- [ ] Provider copy never implies one-click sign-in, Claude OAuth inside Nebula, included usage, X Subscription coverage or a completed turn.
- [ ] Error copy names the thing and the next step. No raw stack traces outside "Details".
