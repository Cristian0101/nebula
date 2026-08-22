# Nebula changelog

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
