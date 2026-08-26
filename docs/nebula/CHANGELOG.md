# Nebula changelog

## Unreleased — Swarm UX Rescue

- Added the first-class Swarm Brief with real Planner readiness, 2/4/8/12/custom non-Planner team presets, a starting role composition, explicit writable concurrency, and trust guardrails.
- Added durable repository/context/provider/decoding/validation planning progress, safe cancellation, classified failure recovery, attempt history, Planner switching, and a baseline-safe manual proposal fallback.
- Replaced the raw default proposal form with Team Plan roster, DAG/table, checkpoint cards, structured Task ownership/provider inspector, warnings, and Advanced-only raw JSON.
- Added server-enforced named checkpoint barriers over required Tasks, current quality gates, approved reviews, and optional human approval.
- Added a canonical War Room and Review & Integration flow, direct Thread/Terminal Center actions, first-class sidebar Swarm navigation, and event-driven Terminal node state transitions.
- Preserved separate Generate, Approve, and Run actions. Approval remains atomic and retry-safe; no action merges `main`.

## Unreleased — Supervised Mission Runs

- Added durable supervised Run state, deterministic dependency/resource/concurrency scheduling, stable crash-safe Task dispatch, and explainable scheduler decisions.
- Added bounded prerequisite context with explicit Nebula provenance and automatic progression through the existing ownership, resource, snapshot, handoff, quality, Reviewer, and Task-completion commands.
- Added branch-scoped attention, pause/resume/stop controls, Mission-ready-for-Integration state, and active Run Thread discovery in Terminal Center Mission Flow.
- Kept plan rewriting, ownership approval, provider rerouting, automatic remediation, automatic Integration, and Swarm Mode out of scope.

## Unreleased — Terminal Center

- Added a Project-scoped spatial workspace for quick-launching configured provider instances as canonical Threads without requiring a Task or Mission.
- Added explicit per-Project current-checkout or isolated Task-backed quick-launch preferences, provider model defaults, and shared-checkout warnings.
- Added Grid, Provider Columns, Status Lanes, Mission Flow, Radial, Compact, and Freeform layouts with persisted positions and viewport.
- Added lightweight node previews, existing Task Thread placement, focused reuse of the full Thread workspace, command-palette navigation, and hide-without-delete semantics.
- Reused provider registry, Threads, Tasks, worktrees, ownership, Mission DAG, chat, terminal, settings, shell projection, and typed commands. No scheduler, provider runtime, terminal engine, or Swarm Mode was added.

## Architect Plan Proposal

- Added bounded provider-neutral Architect generation with strict structured decoding.
- Added deterministic proposal validation, revisions, warnings, rejection, and durable restart hydration.
- Added atomic human approval into canonical draft Missions/Tasks/edges with no execution side effects.
- Added optional Architect Mission baseline pinning while preserving manual Mission behavior.

## Unreleased — Shared-resource coordination

- Added Project Shared Resource definitions and exclusive durable Task leases.
- Added atomic acquisition, safe lifecycle release, and terminal-lease startup repair.
- Added Mission resource blockers without changing the explicit DAG.
- Added Git-evidence resource compliance as a separate review/completion gate.
- Added durable human-created ownership requests with approve, deny, and cancel history.
- Added Settings, Task, Mission, and Command Deck resource controls.
- Automatic scheduling, provider-generated requests, Architect, distributed locks, and Swarm Mode
  remain unimplemented.

## Unreleased — Missions and explicit Task DAGs

- Added durable Project Missions over canonical Tasks with a zero-or-one Mission membership invariant, ordered presentation, explicit dependency edges, and auditable Mission activity.
- Added a pure deterministic DAG engine with actionable self-edge, duplicate-edge, unknown-member, and cycle rejection; deterministic topological execution waves; explicit blockers; and start-configuration attention.
- Enforced Mission activation and readiness in server Task workspace preparation and activation commands, while keeping every Task and wave start human-controlled.
- Added Tasks, Missions, and Integration sections to Command Deck, including graph and wave views, accessible edge authoring, guarded active-graph edits, Mission cancellation/completion, and creating Tasks inside a Mission through the canonical Task flow.
- Added optional Mission association to the existing Integration Batch. The DAG suggests an order, but the human confirms or edits it before creating the Batch.
- Added explicit replacement of failed or cancelled Mission-linked Batches and encoded deterministic artifact IDs before retaining them as valid Git refs.
- Reused Tasks, Threads, providers, worktrees, reviews, Integration, orchestration events, SQLite projections, shell streaming, and client commands. No scheduler, automatic planner, resource locks, Architect, automatic provider routing, or Swarm Mode was added.

## Unreleased — Deterministic Integration Engine

- Added manual Integration Batches over eligible immutable completed Task Results with an exact common-base rule and explicit user ordering.
- Added deterministic retained artifact commits from approved checkpoint trees, dedicated Integration branches/worktrees, sequential application, overlap acknowledgement, and durable per-step evidence.
- Added fail-closed conflict pause, manual staged resolution and transparent human-resolution commits, abort, restart reconciliation, safe terminal cleanup, and source/Task isolation.
- Added final Integration validation through exact approved Project gates, HEAD/tree/worktree mutation detection, required-gate enforcement, Ready state, combined attributed diff RPCs, and Command Deck controls.
- Reused the inherited Git driver/workflow service, checkpoint refs, process runner, orchestration events, SQLite project projection, shell stream, authorization map, and client command runtime.
- Kept main merge, push, automatic PR creation, shared-resource locks, Mission/DAG, scheduler, automated conflict agents, and Swarm Mode out of scope.

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
