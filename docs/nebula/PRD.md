# Nebula product requirements

## Identity

| Field           | Definition                                                  |
| --------------- | ----------------------------------------------------------- |
| Name            | Nebula                                                      |
| Parent          | Kaizora Labs                                                |
| Category        | Open-source multi-agent development orchestration platform. |
| Primary promise | **Your coding agents. One engineering team.**               |

Nebula sits above coding agents the user already trusts. It coordinates independently authenticated tools such as Codex, Claude Code, Gemini/Antigravity, Cursor, Grok, OpenCode, and future providers. Provider support is earned through a real adapter and capability contract; names in this document do not imply that every provider is implemented today.

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
- built-in Codex, Claude, Cursor, Grok, OpenCode, and opt-in Gemini CLI drivers;
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

The current repository does **not** yet provide agent-generated ownership requests, shared-resource locks, deterministic swarm, Mission planning, review automation, or integration queues.

### ROADMAP v0.1 — Command Deck

Build toward:

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

The current slice implements one explicit Task tied to one inherited thread/provider session. A new Builder Task requires explicit write ownership, prepares an isolated inherited Git worktree before its Thread is created, and receives a machine-generated ownership summary. Gemini CLI is manually selectable behind the same provider-neutral Task path; automatic provider assignment and multi-agent automation remain out of scope. Pre-ownership Tasks remain readable and keep their prior behavior.

### ROADMAP v0.2 — Deterministic Swarm

Later, add Mission Composer, an Architect responsibility, a task DAG, ownership prediction and enforcement, shared-resource locks, structured handoffs, independent review, quality gates, and a controlled integration queue.

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
