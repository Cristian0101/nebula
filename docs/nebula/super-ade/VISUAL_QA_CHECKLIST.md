# Super ADE visual QA checklist

**Status:** Proposed. Use this checklist for every Super ADE implementation step (D1–D9 in the [contract](SUPER_ADE_DESIGN_CONTRACT.md#16-engineering-implementation-handoff)). Check only the sections a change touches, and record in the PR which ones were checked and in which client (web or desktop).

Screenshots used as evidence must redact account emails (enable the existing redaction setting) and must never include pairing URLs, tokens or device codes.

## 1. Environments to check

| Item                                                       | Required for                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Web client (`vp run dev`, isolated `--home-dir`)           | Every UI step                                                  |
| Desktop client                                             | Preview, window chrome, traffic-light inset, `setTheme` bridge |
| Widths 375 / 768 / 980 / 1280 / 1920 / 2560 px             | Layout steps                                                   |
| `nebula-ion` dark and light                                | Every UI step                                                  |
| `nebula` (Solar), one other built-in, and one custom theme | Token steps (D1) and any new surface                           |
| OS reduced motion on, plus the `.no-transitions` class     | Any animated change                                            |
| Keyboard only (no pointer)                                 | Every interactive change                                       |
| Screen reader smoke pass (VoiceOver)                       | New components                                                 |

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
- [ ] `ProviderReadinessSummary` counts only enabled instances on the current environment, and never says "ready" for `auth.status: "unknown"`.
- [ ] `ConnectProvidersCta` appears only while an enabled provider is not ready. Dismissal persists per environment.
- [ ] No plan, seats, star-count or decorative "connected" widgets.

## 4. Execution context

- [ ] Every writable surface shows environment (when remote), project, branch and worktree without interaction.
- [ ] The chip renders a fixed-width skeleton while loading, with no toolbar layout shift.
- [ ] Each of the chip states in [INTERACTION_STATES.md §2](INTERACTION_STATES.md#2-execution-context-states) is reproducible with a fixture: mismatch, detached, missing, remote, disconnected.
- [ ] The popover has no direct branch-switch mutation.
- [ ] The composer context strip is editable in a draft and locked after the first send.
- [ ] Terminal panes show "Shell" or "{Provider} CLI · Separate session, not linked to this chat".
- [ ] Remote previews and terminals show the environment name.

## 5. Provider Connections

- [ ] The five observed fixtures render the expected headline and ladder ([states §1.5](INTERACTION_STATES.md#15-observed-states-from-the-running-client-accounts-redacted)).
- [ ] Billing route shows "Not reported" for unmapped values. API and cloud routes use attention tone with explanatory text.
- [ ] The Claude subscription label reads "reported by Claude CLI", and the detail shows the F4 note.
- [ ] Sign-in shows the mechanism and the command. Nothing auto-runs. "Check again" calls `server.refreshProviders` for that instance only.
- [ ] Limited-permission clients see facts but no actions.
- [ ] Emails respect the redaction setting in rows, detail and tooltips.
- [ ] Focus starts on the first attention row and returns to the launcher on close.

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
- [ ] Live regions announce: check results, sign-in outcome, save failure, approvals.
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
- [ ] Error copy names the thing and the next step. No raw stack traces outside "Details".
