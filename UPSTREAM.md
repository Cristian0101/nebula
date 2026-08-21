# Upstream tracking

## Upstream project

| Field                        | Value                                      |
| ---------------------------- | ------------------------------------------ |
| Upstream project             | T3 Code                                    |
| Upstream repository          | https://github.com/pingdotgg/t3code        |
| Upstream license             | MIT                                        |
| Upstream branch              | `main`                                     |
| Initial Nebula baseline SHA  | `592c5983c14d248aa3cfddb8e6c7372f12cd1ab6` |
| Baseline date                | 2026-08-21 EDT                             |
| Current tracked upstream SHA | `592c5983c14d248aa3cfddb8e6c7372f12cd1ab6` |
| Last sync date               | 2026-08-21 EDT                             |

## Fork strategy

Nebula is a public native fork of T3 Code. `origin` is the Nebula repository; `upstream` is T3 Code and has a disabled push URL in local checkouts. Nebula preserves upstream history and extends the existing harness rather than replacing it.

## Attribution policy

Nebula retains T3 Code's MIT license and its original copyright notice. Nebula documentation credits T3 Code as the execution harness. Upstream notices must remain intact in distributed copies and substantial derived portions.

## Upstream sync strategy

Do not routinely rebase published `main`. Sync upstream through a dedicated review branch:

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

## Known divergences

The initial divergence is documentation only:

- Nebula README, contribution, security, changelog, and upstream-tracking documentation.
- Eight architecture decision records under `docs/adr/`.
- An additional Kaizora Labs copyright notice while preserving T3 Code's notice.

No Nebula product functionality, provider adapters, data model, Git behavior, or client runtime behavior is added in this foundation change.

## Known merge conflicts

None known. No upstream sync merge has been attempted.

## Extension points

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
