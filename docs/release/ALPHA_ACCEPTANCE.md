# Nebula Alpha acceptance

This is the Alpha release gate, not a roadmap. A PASS requires a clean committed candidate, all canonical repository gates, real-provider evidence, live recovery evidence, a packaged-desktop smoke, and a complete Mission from the exact candidate HEAD. Deterministic tests support the decision but never replace live-provider proof.

## Decision

**NEBULA ALPHA ACCEPTANCE: PASS**

The certification report attached to the Alpha candidate PR is the run record for the final no-write Mission. It must show that the runtime HEAD, Git HEAD, and certification HEAD are identical and that the working tree stayed clean after `Mission Run: COMPLETED` and `Integration Batch: READY`.

## Release gates

| Gate                         | Result | Certification evidence                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository foundation        | PASS   | PR #19 merged normally at `0909e40c0d1af25b94eda0b7a546fa7fc37b74be`; canonical Task, Thread, provider, event, worktree, review, and Integration contracts remain intact.                                                                                                                                                                                                             |
| Provider onboarding          | PASS   | Fresh disposable homes detected authenticated Codex 0.149.0 and available Antigravity 1.1.20; both completed harmless real turns. Credentials remained provider-owned.                                                                                                                                                                                                                |
| Real Architect               | PASS   | Codex generated a structured four-Task, three-wave notification-preferences proposal from an exact clean baseline. A human reviewed and approved it through the normal Architect boundary.                                                                                                                                                                                            |
| Real supervised Swarm        | PASS   | A real four-Task Codex + Antigravity Mission used automatic scheduling, isolated Task worktrees, Shared Resources, prerequisite context, gates, independent review, remediation, TaskResults, and automatic Integration. The final report records the exact-head rerun IDs.                                                                                                           |
| Cross-provider execution     | PASS   | Codex and Antigravity both produced real Task artifacts in one Mission. No mock provider satisfied this row.                                                                                                                                                                                                                                                                          |
| Dependency context           | PASS   | Downstream Tasks received the canonical prerequisite package containing upstream TaskResult summary, immutable snapshot, changed paths, and handoff evidence.                                                                                                                                                                                                                         |
| Shared Resource coordination | PASS   | The live scheduler recorded acquire → wait → release → automatic waiter progression for the shared notification-preferences contract.                                                                                                                                                                                                                                                 |
| Review remediation           | PASS   | An independent Reviewer returned genuine `REQUEST_CHANGES`; the same Task, Mission, Thread, and worktree completed a bounded remediation turn, created a new immutable snapshot, reran fresh gates, and received a fresh approval.                                                                                                                                                    |
| Provider replacement         | PASS   | A disposable live Task preserved Task/Mission/worktree identity and attempt history while Antigravity became unavailable and Codex completed the replacement attempt.                                                                                                                                                                                                                 |
| Automatic Integration        | PASS   | All TaskResults automatically created one Mission-linked Integration Batch. Artifacts were applied in DAG order in an isolated Integration worktree.                                                                                                                                                                                                                                  |
| Integration Ready            | PASS   | Task+Integration and Integration-only gates ran from the Integration worktree. Ready was emitted only after fresh final validation passed.                                                                                                                                                                                                                                            |
| Recovery A–K                 | PASS   | Focused regression covers every case; C, E, H, I, and K were also exercised live during this certification. The matrix below records the observed behavior.                                                                                                                                                                                                                           |
| WebSocket reconnect          | PASS   | During active work the client showed a disconnect, reconnected, rehydrated canonical state, and showed no duplicate Task, turn, message, or schedule.                                                                                                                                                                                                                                 |
| Terminal Center scale        | PASS   | One disposable Project displayed 21 canonical nodes, with at least 20 visible in every measured layout and four simultaneous real working sessions. Grid, Provider columns, Status lanes, Mission flow, Radial, Compact, and Freeform all remained responsive.                                                                                                                        |
| Terminal Center persistence  | PASS   | Three Freeform nodes moved from `42/340/638,52` to `117/415/713,142`; positions survived layout changes and a full server restart. Exactly one selected heavy Thread view was mounted.                                                                                                                                                                                                |
| Long-session stability       | PASS   | The certification sequence exceeded 20 minutes and included providers, Mission progression, remediation, replacement, Integration, layouts, and reconnects. A failed-Integration attention state exposed a reconciliation feedback loop; the candidate excludes its own emitted event and the same pathological home fell from sustained >120% CPU to 0.1% with event growth stopped. |
| Desktop Alpha package        | PASS   | `Nebula-0.0.33-arm64.dmg` mounted read-only and contained native arm64 `Nebula (Alpha).app` version/build 0.0.33. The app launched against a clean temporary home, opened the fixture repo, Terminal Center, and Command Deck.                                                                                                                                                        |
| Packaged real providers      | PASS   | The mounted app returned exact real responses `PACKAGED_CODEX_READY` and `PACKAGED_ANTIGRAVITY_READY`; after restart the Project, both Threads, provider labels, and both canvas nodes persisted.                                                                                                                                                                                     |
| Full canonical regression    | PASS   | Formatting, lint, typecheck, full tests, Swarm Alpha benchmark, production build, and desktop smoke all pass on the frozen candidate. Exact commands and counts are in the certification report and PR checks.                                                                                                                                                                        |
| Security and isolation       | PASS   | All runtime homes and Git fixtures were disposable `/private/tmp` paths. Tasks never wrote the source checkout, Integration stayed isolated, main was never merged by Swarm, and secret-hygiene checks found no provider credentials in SQLite, logs, commits, or PR content.                                                                                                         |

## Recovery matrix

| Case | Interruption                         | Observed recovery                                                                                                                                                                  | Result |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A    | Mid-provider turn                    | Interrupted attempt reconciled truthfully; no duplicate turn; bounded retry continued in the same Task worktree.                                                                   | PASS   |
| B    | Changes before review                | Immutable diff snapshot and handoff survived restart; review resumed against the same artifact.                                                                                    | PASS   |
| C    | Task quality gate                    | Captured runtime was terminated after the fixture sentinel. The old gate became interrupted/failed, never passed, and a fresh rerun passed in the preserved worktree.              | PASS   |
| D    | Reviewer generation                  | Interrupted review never produced approval; retry generated one canonical verdict against the immutable snapshot.                                                                  | PASS   |
| E    | Between Mission waves                | Wave 2 remained dependency-ready but unscheduled while Antigravity was unavailable. Restart preserved readiness; restoring availability started exactly one attempt automatically. | PASS   |
| F    | Shared Resource wait                 | Lease owner and waiter survived restart; release automatically advanced the waiter without a manual Task start.                                                                    | PASS   |
| G    | Provider replacement                 | Task/Mission/worktree identity and attempt history survived provider failure; replacement completed canonically.                                                                   | PASS   |
| H    | During remediation                   | Review history, remediation budget, and attempt count survived restart; no parallel remediation appeared; fresh snapshot, gates, review, and completion followed.                  | PASS   |
| I    | Mid-Integration artifact application | Restart recognized the already committed artifact with projection pending, avoided duplicate commits, and applied the remaining artifact once.                                     | PASS   |
| J    | Integration conflict                 | Conflict remained visible and human-gated; continuation never auto-merged main.                                                                                                    | PASS   |
| K    | Final Integration validation         | Interrupted Integration gate never passed or made the batch Ready. A human-triggered fresh validation passed before Ready.                                                         | PASS   |

## Canonical verification

Run from the frozen candidate:

```bash
npm run fmt:check
npm run lint
npm run typecheck
npm test
npm run benchmark:swarm-alpha
npm run build
npm run test:desktop-smoke
```

All seven commands must pass. The benchmark creates its own temporary mini-SaaS repository and explicitly reports deterministic coverage separately from live-provider coverage.

## Live-provider acceptance procedure

1. Create unique `/tmp/nebula-alpha-home-*` and `/tmp/nebula-alpha-fixture-*` paths. Print and verify both before launch.
2. Start `vp run dev --home-dir <temporary-home>` and open the complete pairing URL.
3. Add the fresh fixture through **New project** and confirm its exact clean baseline.
4. In **Settings → Providers**, refresh and record installed, authenticated/available, ready, and version state for Codex and Antigravity without exposing credentials.
5. Ask Architect for the bounded notification-preferences objective. Review the four Tasks, three waves, ownership, Shared Resources, providers, acceptance criteria, and quality policy before approval.
6. Run Supervised Swarm without manually starting Tasks. Record provider process, Thread, worktree, TaskResult, dependency package, resource lease, gate, review, remediation/replacement, and scheduler evidence.
7. Require all Tasks to complete and Automatic Integration to reach Ready only after its approved Task+Integration and Integration-only gates pass.
8. Confirm the source checkout and main branch remain unchanged. Confirm runtime HEAD, Git HEAD, and candidate HEAD match after the Mission.

## Evidence rules

- Mock providers, manually inserted rows, projection-only fixtures, and deterministic benchmarks do not count as live acceptance.
- A provider counts only when its real binary, canonical Thread, intended workspace, output, and completion are observed.
- Ready applies only to the isolated Integration Batch after final validation. It never implies publication or a merge to main.
- Any unresolved P0 or Alpha-blocking P1 changes this decision to FAIL.
