# Nebula product requirements

## Architect planning

Architect planning is proposal-first AI assistance. Repository context is bounded and protected, model output is strictly decoded, deterministic policy validation is authoritative, provider recommendations are advisory, and approval is human-only. Approved plans become draft Missions and draft Builder Tasks pinned to one planning commit; activation and execution remain separate explicit actions.

## Identity

| Field           | Definition                                                  |
| --------------- | ----------------------------------------------------------- |
| Name            | Nebula                                                      |
| Parent          | Kaizora Labs                                                |
| Category        | Open-source multi-agent development orchestration platform. |
| Primary promise | **Your coding agents. One engineering team.**               |

Nebula sits above coding agents the user already trusts. It coordinates independently authenticated tools such as Codex, Claude Code, Antigravity, Cursor, Grok, OpenCode, and future providers. Provider support is earned through a real adapter and capability contract; names in this document do not imply that every provider is implemented today. For individual Google accounts, Antigravity is the supported Google terminal provider. The Gemini CLI prototype is retained outside mainline only for potential enterprise Code Assist, API-key, or future-compatible paths.

## What Nebula is not initially

Nebula is not initially:

- an IDE replacement;
- a model provider;
- a GitHub replacement;
- a CI/CD platform;
- a cloud coding environment;
- a generic project-management application; or
- an autonomous startup builder.

The inherited T3 Code clients remain the execution surface. Nebula differentiates through coordination, safety, trust, and recovery.

## Core product problem

Nebula answers:

> How can multiple powerful coding agents work on the same software project concurrently without destroying each other's work?

Nebula owns tasks, later missions, roles, provider assignment, workspace isolation, ownership, resource locks, agent lifecycle, events, diffs, review, integration, recovery, and history.

Providers own model execution, authentication, provider-specific tooling, and underlying inference. Nebula observes and coordinates provider sessions; it does not impersonate their runtimes.

## Product principles

### Existing agents, not replacement agents

Nebula orchestrates tools the user already trusts. Provider-specific capabilities remain behind the inherited driver and adapter boundaries.

### Isolation before intelligence

Concurrency must be safe before it becomes autonomous. Workspaces, ownership, reversibility, and deterministic state precede automatic planning.

### Roles are permissions

Architect, Builder, Tester, Reviewer, and Integrator represent responsibilities and permissions, not personalities. A role constrains what a session may change or approve.

### Human approval is first-class

The user must always be able to pause, inspect, reject, reroute, reassign, revert, and override. Autonomous progress must not turn recovery into archaeology.

### Every action must be traceable

Nebula should be able to relate a task to its agent, provider, workspace, commands, changed files, tests, commits, review, and integration outcome.

### Cross-provider work is a feature

Different providers may perform different responsibilities. The coordination model must not encode one provider's model names, authentication, or protocol as universal domain truth.

## Product sequence

The lists below are roadmap commitments, not claims about current implementation.

### CURRENT — inherited foundation

The current repository already provides:

- web, desktop, and mobile clients;
- local and remote environment connections;
- projects and durable threads;
- built-in Codex, Claude, Antigravity, Cursor, Grok, and OpenCode drivers;
- provider-owned authentication detection and provider sessions;
- terminal and process execution;
- Git/VCS operations, including worktree creation and removal;
- per-turn checkpoints, diffs, restore, and provider conversation rollback;
- a persisted command/event/projection orchestration engine;
- local SQLite state, migrations, and typed WebSocket RPC; and
- system/light/dark appearance, built-in palettes, custom themes, and desktop theme bridging;
- durable Nebula Tasks scoped to a Project, with draft, active, completed, and cancelled lifecycle state;
- optional one-to-one Task binding to an inherited Thread and its provider/session context; and
- a compact project Task surface for creating, starting, opening, completing, and cancelling Tasks.
- one durable Git worktree per started writable Builder Task, captured from the clean source checkout's exact `HEAD` commit;
- durable workspace preparation, ready, failed, missing, removal, and cleanup-failure state; and
- explicit, dirty-safe worktree cleanup after a Task reaches a terminal state.
- durable Task ownership rules with write, read-only, and deny access;
- automatic and manual validation of committed and working-tree changes against the recorded Task base;
- persisted ownership status and violation evidence with restart reconciliation; and
- fresh ownership validation before a managed Task may complete.
- complete Task Diff evidence from immutable base through committed, staged, unstaged, and untracked state, with lazy per-file patches;
- immutable Task review snapshots and provider-neutral structured handoffs with manual fallback;
- stale-snapshot completion blocking with fresh ownership and freshness checks; and
- confirmed, unpublished-branch-only Task restore with a retained pre-restore recovery snapshot and undo.
- a desktop-first Command Deck that composes Project-scoped Tasks, provider readiness, workspaces, ownership, changes, review, restore, and the existing Thread execution surface;
- durable manual provider/model assignment for draft Tasks before a Thread exists; and
- manual parallel execution of independent provider-backed Tasks in separate managed worktrees.
- optional durable Task acceptance criteria with explicit confirmation for post-start edits;
- local Project quality policies whose exact commands require user approval before execution;
- snapshot-bound, bounded quality results with timeout, cancellation, mutation detection, and restart-safe history; and
- provider-neutral independent review with cross-provider preference, same-provider fallback, structured verdict invariants, human-controlled findings handoff, and multiple review rounds.

The current repository also provides durable Missions over canonical Tasks, explicit acyclic dependencies, derived readiness and execution waves, manual starts, explicitly authorized Supervised Mission Runs, active-graph audit events, and optional Mission-linked Integration Batches. It does **not** provide agent-generated ownership requests, automatic provider routing, automatic remediation, automatic integration queues, or Swarm Mode.

### IMPLEMENTED v0.1 — Command Deck

Command Deck now provides:

- open a local repository;
- detect providers and display authentication state;
- create explicit tasks;
- assign a provider and role;
- create an isolated writable workspace;
- assign ownership;
- run multiple sessions;
- show task diff and task status;
- revert a task;
- show an activity timeline;
- configure providers; and
- apply the Nebula design system.

The user remains the coordinator: provider/model choice, ownership, Start, review, completion, restore, and cleanup are explicit actions. Command Deck derives presentation and attention state from canonical Task, Thread, provider, workspace, ownership, and review projections. It does not persist a Command Deck entity or duplicate provider output. Draft Task assignment is stored on the Task because no Thread exists yet; once execution starts, the bound Thread's model selection is authoritative for that execution.

Manual parallel provider Tasks, quality gates, independent reviews, deterministic Integration Batches, Missions, explicit Task dependencies, Shared Resources, Architect planning, and supervised deterministic execution are implemented. Provider routing, automatic integration, automatic remediation loops, and Swarm Mode remain out of scope.

### IMPLEMENTED v0.2 — Quality Gates and Reviewer

New managed Builder Tasks require independent review by default while historical Tasks keep their prior completion behavior. Users may change the Project policy or the Task-level requirement. Required approved gates must pass against the current immutable snapshot before review; a workspace mutation stales that snapshot and its results. Reviewer generation uses the selected provider instance's shared `TextGeneration` capability against a bounded, data-minimized evidence package. Schema decoding and server invariants fail closed, and a blocking or security finding cannot coexist with an approving verdict.

### IMPLEMENTED v0.3 — Missions and explicit execution waves

A Mission is the durable coordination boundary for a human-authored engineering objective. Each Task belongs to at most one Mission, remains a canonical Task with its existing workspace/result/review lifecycle, and may depend on other Mission Tasks. The server rejects cycles and direct execution that would bypass Mission readiness. Waves are derived topological views, never persisted scheduler state. The user explicitly activates the Mission, starts one ready Task or all currently ready Tasks, edits the graph within guarded rules, creates an optional Integration Batch, and explicitly completes or cancels the Mission.

### IMPLEMENTED v0.4 — Supervised deterministic execution

A human-approved active Mission can start one durable supervised Run. The runner deterministically schedules canonical Tasks by dependency wave, Mission order, stable ID, Shared Resource availability, provider/ownership readiness, and a configured writable concurrency cap. It injects bounded prerequisite evidence and advances the existing completion/review pipeline. In Supervised Swarm, a frozen policy may apply bounded retry, remediation, provider routing/replacement, and Automatic Integration. It never rewrites or approves plans, expands ownership, resolves conflicts, publishes, or merges `main` without a human boundary.

Command Deck and Swarm Mode must use the same Task, Workspace, Provider, Session, Event, Diff, and Review primitives.

### ROADMAP v0.3 — Adaptive routing

Later, add provider/model aliases, provider scoring, Ichnos, capacity-aware routing, and automatic fallback. Routing remains a policy over provider-neutral tasks and real provider capabilities, not a replacement provider runtime.

## Success characteristics

Nebula succeeds when independent work can proceed in parallel while the user can answer, at any time:

- Who is doing what?
- In which workspace and from which baseline?
- What may this task change?
- What actually changed and what was tested?
- What is waiting for review or integration?
- How can this action be stopped or undone?

## Shared-resource coordination

- A Project defines enabled exclusive Shared Resources with repository-relative ownership-compatible
  globs. A Task explicitly names the resources it requires.
- Task start atomically acquires every required lease or starts nothing and reports the holder.
- Held leases survive restart and release on completion or cancellation; startup repairs stale leases
  whose owning Task is terminal.
- Git-derived changes are checked against held leases separately from ownership, and violations block
  review and completion.
- Ownership expansion is a durable human-reviewed request. Approval changes canonical ownership;
  requiring an intersecting resource is a separate explicit action.
- Automatic scheduling, provider-generated requests, Architect, and Swarm Mode remain out of scope.
