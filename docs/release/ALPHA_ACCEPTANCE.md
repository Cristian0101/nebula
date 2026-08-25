# Nebula Alpha acceptance

This is the release gate, not a roadmap. A PASS requires current evidence from the branch being proposed for Alpha. Deterministic tests support the decision but never substitute for the live-provider rows.

## Current decision

**NEBULA ALPHA ACCEPTANCE: FAIL**

The repository foundation, provider onboarding, live Terminal Center sessions, live Architect proposal, deterministic benchmark, and packaged-desktop first launch are proven. The final branch has not yet completed a clean real-provider Mission through automatic cross-provider execution, requested-changes remediation, provider replacement, and Integration Ready. The full crash matrix is also incomplete.

## Release gates

| Gate                             | Result | Current evidence                                                                                                                                                                          |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository foundation            | PASS   | PR #17 merged normally at `325ba8131358730c80145149a0f27fca27bfebdc`; Task/runtime/Git/event architecture retained.                                                                       |
| Provider onboarding              | PASS   | Fresh isolated web home showed real installed, authentication, readiness, version, refresh, enable, and update state.                                                                     |
| Terminal Center real Codex       | PASS   | Real Codex Task Thread plus additional canonical Codex nodes launched in the isolated fixture.                                                                                            |
| Terminal Center real Antigravity | PASS   | Antigravity 1.1.19 completed a real provider turn and reported the fixture branch.                                                                                                        |
| Architect live provider          | PASS   | Codex generated a structured four-Task proposal against the fixture's exact baseline; a human edited and approved it in the canonical UI.                                                 |
| Real supervised Swarm            | FAIL   | The first live run stopped in Wave 1 after exposing a gate-scope defect; the final-head clean rerun is not complete.                                                                      |
| Cross-provider execution         | FAIL   | Both providers ran real sessions, but not yet as completed Tasks in one successful Swarm Mission.                                                                                         |
| Review remediation               | FAIL   | Quality remediation ran twice, but a controlled independent-review `REQUEST_CHANGES → new snapshot → approval` chain is not proven.                                                       |
| Provider replacement             | FAIL   | No live automatic provider replacement has been completed.                                                                                                                                |
| Integration Ready                | FAIL   | No final live Integration Batch has reached Ready.                                                                                                                                        |
| Restart recovery                 | FAIL   | Project, Threads, Tasks, DAG, attempts, and Terminal Center state rehydrated without duplicates after a server restart; the complete A–K crash matrix is not proven.                      |
| Desktop Alpha package            | PASS   | The final `Nebula-0.0.33-arm64.dmg` mounted read-only; its Nebula Alpha app launched against a unique temporary home, displayed version 0.0.33, and preserved the project across restart. |
| Fresh-user onboarding            | PASS   | Empty isolated web and packaged-desktop homes reached project add, provider status, Terminal Center, and Command Deck through visible UI; the web run also launched real providers.       |

## Deterministic benchmark

Run:

```bash
npm run benchmark:swarm-alpha
```

The command copies the owned mini-SaaS fixture to a unique temporary repository, records its exact Git baseline, proves baseline tests pass, proves the notification-preferences integration test fails before implementation, runs focused scheduler/recovery/Integration tests, and validates the four-Task, three-wave, two-provider scenario contract. Its output explicitly reports `liveProviderCoverage: false`.

## Live-provider acceptance procedure

1. Create unique `/tmp/nebula-p17-home-*` and `/tmp/nebula-p17-fixture-*` paths. Resolve and print both paths; stop if either resolves to a normal user home or an important repository.
2. Start `vp run dev --home-dir <temporary-home>` and open its complete pairing URL.
3. Add the fresh benchmark copy through **New project**. Confirm the exact baseline and clean checkout.
4. In **Settings → Providers**, refresh and record installed/authenticated/ready/version state for Codex and Antigravity. Do not expose credentials.
5. In Terminal Center, launch real Codex, Antigravity, and a second Codex Thread. Exercise every layout, focus each Thread, drag in Freeform, switch layouts, and confirm the coordinates return.
6. Ask Architect to add notification preferences while preserving auth and billing. Review its bounded proposal, edit the DAG to the fixture's three waves when needed, assign both providers, declare ownership and the shared profile resource, approve, and activate.
7. Approve `npm test` for Task + Integration and `npm run test:integration` for Integration only. Require independent review, enable bounded routing/retry/remediation, set concurrency to at least two, and enable Automatic Integration.
8. Run Swarm without manually starting individual Tasks. Record canonical provider process, Thread, Task worktree, output, files, handoff, gate, review, remediation/replacement, dependency package, resource lease, and scheduler decisions.
9. Require a controlled review request for changes and one safe provider replacement. Continue only through canonical attention actions.
10. Confirm all Tasks complete, one Integration Batch applies their immutable artifacts in DAG order, final gates pass, and state is Ready. Confirm the source checkout and `main` were not mutated.
11. Repeat the critical restart points and the final clean Mission on the proposed branch HEAD. Then build and launch the desktop artifact from a fresh temporary desktop home.

## Evidence rules

- Mock providers, manually inserted rows, projection-only fixtures, and deterministic benchmark results do not count as live acceptance.
- A provider is counted only when its real binary, session, canonical Thread, intended workspace, output, filesystem result, and completion are observed.
- Ready applies only to the isolated Integration Batch after final gates. It never implies publication or a merge to `main`.
- Any unresolved P0 or Alpha-blocking P1 keeps this document at FAIL.
