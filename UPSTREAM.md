# Upstream tracking

## Recorded upstream baseline

This table records the foundation tracking metadata from 2026-08-21; it is not a live sync or release-readiness claim. Verify Git ancestry and remote configuration before an authorized sync.

| Field                         | Value                                      |
| ----------------------------- | ------------------------------------------ |
| Upstream project              | T3 Code                                    |
| Upstream repository           | https://github.com/pingdotgg/t3code        |
| Upstream license              | MIT                                        |
| Upstream branch               | `main`                                     |
| Initial Nebula baseline SHA   | `592c5983c14d248aa3cfddb8e6c7372f12cd1ab6` |
| Baseline date                 | 2026-08-21 EDT                             |
| Recorded tracked upstream SHA | `592c5983c14d248aa3cfddb8e6c7372f12cd1ab6` |
| Recorded sync date            | 2026-08-21 EDT                             |

## Fork strategy

Nebula is a public native fork of T3 Code. `origin` is the Nebula repository; `upstream` denotes T3 Code; verify that its push URL is disabled in the current checkout. Nebula preserves upstream history and extends the existing harness rather than replacing it.

## Attribution policy

Nebula retains T3 Code's MIT license and its original copyright notice. Nebula documentation credits T3 Code as the execution harness. Upstream notices must remain intact in distributed copies and substantial derived portions.

## Upstream sync strategy

This procedure applies only to an explicitly requested upstream sync; it is not an agent startup requirement. Follow [AGENTS.md](AGENTS.md), inspect dirty/untracked work and remote ancestry first, and isolate rather than overwrite existing work. Do not routinely rebase published `main`. Sync upstream through a dedicated review branch:

```text
main
  ↓
upstream-sync/YYYY-MM-DD
  ↓
fetch upstream
  ↓
merge upstream/main
  ↓
resolve documented conflicts
  ↓
run complete validation
  ↓
review the diff and open a PR into main
```

Conceptually:

```bash
git fetch upstream --prune
git switch main
git pull --ff-only origin main
git switch -c upstream-sync/YYYY-MM-DD
git merge upstream/main
```

Never push to `upstream`, and do not merge upstream directly into a feature branch.

## Historical foundation divergence

At the initial baseline, the divergence was documentation only:

- Nebula README, contribution, security, changelog, and upstream-tracking documentation.
- Eight architecture decision records under `docs/adr/`.
- An additional Kaizora Labs copyright notice while preserving T3 Code's notice.

That foundation change added no product functionality. Subsequent Nebula work implements Tasks, ownership, Missions, review, quality gates, integration, and provider/client extensions; consult [current contracts](docs/nebula/README.md) and implementation rather than this historical inventory.

## Historical merge-conflict record

No conflicts or attempted sync were recorded at the foundation baseline. This is not evidence about current mergeability.

## Extension strategy reference

This foundation-era strategy table explains attachment intent, not current capability status. [EXTENSION_CONTRACT.md](docs/nebula/EXTENSION_CONTRACT.md) and verified implementation own current attachment decisions.

| Area                         | Upstream primitive                                                                        | Nebula strategy                                                                                        | Classification          |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------- |
| Contracts                    | `packages/contracts` Effect schemas and RPC group                                         | Add versioned mission, task, ownership, handoff, and review contracts beside existing contracts.       | Narrowly extend         |
| Server orchestration runtime | `apps/server/src/orchestration` event-sourced commands, decider, projectors, and reactors | Add Nebula policies and state transitions through the existing command/event/projection pattern.       | Nebula module added     |
| Provider registry            | `apps/server/src/provider`, built-in drivers, instance and adapter registries             | Reuse drivers and session plumbing; keep provider-specific behavior in adapters.                       | Reuse / narrowly extend |
| Provider session lifecycle   | `ProviderService`, `ProviderInstanceRegistry`, `ProviderAdapterRegistry`                  | Associate Nebula tasks with existing sessions without creating a second process manager.               | Narrowly extend         |
| VCS and Git                  | `apps/server/src/vcs` and existing worktree RPCs                                          | Build task-isolation and integration policy on existing Git drivers and worktree operations.           | Narrowly extend         |
| Checkpoints and diffs        | `apps/server/src/checkpointing`, `CheckpointReactor`, VCS checkpoint operations           | Reuse for task baselines, review, recovery, and reversible integration.                                | Reuse unchanged         |
| Events and read model        | Existing orchestration event store, projectors, command receipts, and subscriptions       | Append Nebula events and projections where needed; never create a parallel event bus or state machine. | Narrowly extend         |
| Persistence                  | Local SQLite layers and migrations in `apps/server/src/persistence`                       | Add local mission/task/ownership projections only when the runtime model requires them.                | Narrowly extend         |
| Client runtime               | `packages/client-runtime` RPC and state primitives                                        | Reuse transport, authorization, and shared state patterns.                                             | Reuse unchanged         |
| Desktop and web UI           | `apps/desktop`, `apps/web`, and typed RPC surface                                         | Add focused Nebula views such as Command Deck without a second shell or transport.                     | Nebula module added     |

## Do not duplicate

Nebula must not introduce a competing provider system, Git system, terminal/process manager, event bus, database/state machine, or Electron shell. The differentiation is coordination: worktree isolation, ownership, structured handoffs, review, and controlled integration.
