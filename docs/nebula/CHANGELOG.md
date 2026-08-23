# Nebula changelog

## Unreleased — Quality Gates and independent Reviewer

- Added optional durable Task acceptance criteria and explicit confirmation for edits after execution starts.
- Added local Project quality policies with exact-command approval, Task-worktree execution, bounded output, timeout, cancellation, mutation detection, and snapshot-bound run history.
- Added Project review policy, cross-provider recommendation, visible same-provider fallback, provider-neutral structured ReviewResult rounds, fail-closed verdict invariants, and human-controlled findings handoff.
- Required-review Tasks now need current required gate passes and a current approving review before the existing ownership/freshness completion flow can finish.
- Reused the inherited process runner, provider instances and TextGeneration, Task ChangeSet/checkpoints, orchestration events, SQLite projections, client runtime, and Command Deck.
- Kept integration, shared-resource locks, Mission/DAG, scheduling, automatic planning/routing/remediation, and Swarm Mode out of scope.

## Unreleased — Command Deck

- Added a desktop-first Project Command Deck for creating, assigning, starting, monitoring, inspecting, reviewing, restoring, and cleaning up several canonical Tasks from one surface.
- Added durable provider/model assignment for draft Tasks without creating placeholder Threads; the bound Thread remains execution authority after Start.
- Added Project-scoped Task rail, repository summary, provider diversity, selected canonical Thread context, inspector tabs, filtered milestone activity, and derived attention reasons.
- Reused the existing provider registry, Task workspaces, ownership editor and validation, lazy Task Diff, review handoff, restore, typed commands, shell subscriptions, and desktop shell.
- Kept Mission, DAG, scheduler, automated planning/routing, shared-resource locks, automated Reviewer, integration, and Swarm Mode out of scope.

## Unreleased — Task Diff, review handoff, and safe restore

- Added canonical complete Task change sets, line statistics, binary metadata, and lazy file diffs from immutable Task base to current worktree state.
- Added immutable review snapshots, provider-neutral structured handoffs, manual fallback, deterministic stale detection, and a two-pass ownership/freshness completion gate.
- Added confirmed Task-only restore for unpublished managed branches with a durable pre-restore recovery ref, restart fail-closed behavior, retained provider history, and Undo Restore.
- Kept independent Reviewer roles, quality gates, shared-resource locking, integration, Mission/DAG, and Swarm automation out of scope.

## Unreleased — Antigravity CLI provider

- Added Antigravity as a first-party ProviderDriver using the official `agy` headless `stream-json` interface.
- Added provider-owned readiness, provider-default and manual model selection, structured JSON text generation, normalized text/tool/result events, conversation continuation, and managed cancellation.
- Bound first turns to the effective Task worktree with `--new-project`; Task ownership remains the authoritative progression gate for resulting changes.
- Kept permissions conservative: workspace edits use Antigravity's supported mode, dangerous permission bypass is never enabled, and soft-denied operations surface as provider errors.
- For individual Google accounts, Antigravity is the supported Google terminal provider. The Gemini CLI prototype remains experimental and blocked for this authentication path.

## Unreleased — Task ownership engine

- Added durable repository-relative write, read-only, and deny rules to new writable Builder Tasks.
- Added fail-closed ownership evaluation with deny precedence, unclassified and read-only violations, untracked-file coverage, and both-side rename validation.
- Added automatic post-checkpoint validation, manual validation, scope editing with revalidation, persisted evidence, and startup reconciliation.
- Added a fresh-validation completion gate: violations or Git inspection errors leave the Task active while the provider Thread remains usable for remediation.
- Added a compact ownership editor, explicit Entire Repository choice, validation state, and violation evidence to the existing project Task surface.
- Preserved pre-ownership Tasks as Legacy / Unconfigured without retroactive violations.
- Ownership is an enforced progression boundary, not an OS, process, credential, or network sandbox. Shared locks, ownership requests, review, integration, Mission, and Swarm remain deferred.

## Unreleased

### Task workspace isolation

- New writable Builder Tasks prepare one durable Git worktree before Thread creation.
- Task workspace records persist source repository, exact base commit, stable branch, inherited path, lifecycle state, timestamps, and safe failure details.
- Startup reconciliation adopts completed worktrees, reports missing workspaces, and resumes interrupted explicit cleanup.
- Terminal Task cleanup refuses dirty worktrees, never forces removal, and preserves branches.
- Pre-isolation Tasks and existing Threads remain compatible with their original shared workspace.
