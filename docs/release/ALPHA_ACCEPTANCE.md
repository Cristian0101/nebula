# Nebula Alpha acceptance

This is the release gate, not a roadmap. A PASS requires current evidence from the branch being proposed for Alpha. Deterministic tests support the decision but never substitute for the live-provider rows.

## Current decision

**NEBULA ALPHA ACCEPTANCE: FAIL**

The repository foundation, provider onboarding, real Codex and Antigravity execution, live Architect proposal, dependency/resource scheduling, provider replacement, and an isolated Integration reaching Ready are proven. Acceptance remains failed because the successful Mission predates the final reviewer-picker fix, its successful review did not exercise `REQUEST_CHANGES` remediation, recovery cases C, E, H, I, and K are not all proven live, the final long-session and Terminal Center scale run is incomplete, and the canonical lint gate is red.

## Release gates

| Gate                             | Result | Current evidence                                                                                                                                                                                                          |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository foundation            | PASS   | PR #18 merged normally at `dca103437b32a4722a563257a0aa2a2e190b5335`; Task/runtime/Git/event architecture retained.                                                                                                       |
| Provider onboarding              | PASS   | A fresh isolated home proved Codex 0.149.0 and Antigravity 1.1.20 installed, authenticated, ready, and able to complete harmless real turns.                                                                              |
| Terminal Center real Codex       | PASS   | Real Codex Task Threads ran in the isolated notification-preferences fixture.                                                                                                                                             |
| Terminal Center real Antigravity | PASS   | Antigravity completed real Task work in its canonical isolated Task Thread/worktree.                                                                                                                                      |
| Architect live provider          | PASS   | Codex generated a structured four-Task, three-wave proposal against exact baseline `10d9b80af5507d6b431c5155b456cb8194fe4c4b`; a human approved it in the canonical UI.                                                   |
| Real supervised Swarm            | FAIL   | Run `f0f862ec-0cfc-4166-b6dd-3d4b2174b20e` completed to Integration Ready, but it began at `ed96aeaadfc312d21efeb111905f4b9528885ff4`, before final branch HEAD `29c20950e`.                                              |
| Cross-provider execution         | PASS   | Codex and Antigravity completed real Tasks in one successful Supervised Swarm Mission with automatic DAG progression.                                                                                                     |
| Dependency and resource flow     | PASS   | The live run observed prerequisite context plus acquire → wait → release → automatic resume on the shared User settings contract lease.                                                                                   |
| Review remediation               | FAIL   | Independent reviews ran live, including restart-safe failure and a final Codex approval, but this final-head Mission did not produce a controlled `REQUEST_CHANGES → remediation → approval` chain.                       |
| Provider replacement             | PASS   | Task `6e68d97e-6497-4962-adfb-365c637a086c` retained identity/worktree while Antigravity attempts 1–2 failed/replaced and Codex attempt 3 continued successfully.                                                         |
| Integration Ready                | PASS   | Mission-linked batch `e180b685-1c5a-47da-8619-fa3b93606bef` applied all four artifacts and passed `npm test` plus `npm run test:integration` in its Integration worktree.                                                 |
| Restart recovery                 | FAIL   | Live cases A, B, D, F, G, and J plus WebSocket rehydration passed without false success; C, E, H, I, and K are not all proven live on the proposed head.                                                                  |
| Long-session and scale           | FAIL   | The multi-provider session remained stable through repeated restarts and Integration, and deterministic 20-node layout tests pass, but the complete live 20-node/8-visible/4-active performance acceptance is incomplete. |
| Desktop Alpha package            | PASS   | Final-head build and `npm run test:desktop-smoke` pass. The earlier packaged-app live launch used an older branch head, so it is not counted as final-head live-provider proof.                                           |
| Full canonical regression        | FAIL   | Formatting, typecheck, 2,739 server tests plus all other package tests, benchmark, build, and desktop smoke pass; `npm run lint` fails on a pre-existing manual Effect runtime call.                                      |
| Fresh-user onboarding            | PASS   | Empty isolated web and packaged-desktop homes reached project add, provider status, Terminal Center, and Command Deck through visible UI; the web run also launched real providers.                                       |

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
