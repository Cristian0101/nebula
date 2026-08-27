# ADR-009: Treat Terminal Workspace surfaces as views over canonical Tasks

## Status

Implemented

## Context

Terminal Workspace can arrange provider Threads, shells, development servers, Preview, logs, tests, and Git information. If those panes acquire their own Task, ownership, diff, validation, or review records, Nebula would have two incompatible execution systems and future Swarm scheduling could not reuse manual work.

## Decision

A Task is the durable engineering object. A Terminal Workspace pane may persist an optional Task ID, but it remains only a view. Task identity, worktree, Thread, ownership rules and validation, TaskChangeSet, quality runs, structured handoff, review snapshot, verdict, restore state, and lifecycle transitions stay in the canonical orchestration domain.

Task-bound writable surfaces execute from the canonical Task worktree. General repository panes remain supported. Provider replacement binds a new canonical Thread to the existing Task instead of replacing Task identity.

## Consequences

Terminal Workspace can expose accountable execution without duplicating runtime state. Task-bound panes recover their layout and attachments independently from provider or PTY process survival. Renderer code must resolve current Task state and must not infer readiness or review status from pane-local flags.

The Task inspector and Task Diff may load more data than a general pane, so those queries remain lazy and scoped to the selected Task. Panes subscribe to the project projection once and use indexed Task and Thread maps instead of subscribing every pane to the full event stream.

## Recovery implications

Startup recovery verifies persisted state against filesystem, Git, terminal metadata, port ownership, and HTTP reachability. Missing worktrees and interrupted processes are reported truthfully. Recovery preserves work and never resets a Task worktree. Externally attached servers remain external.

## Swarm implications

Future deterministic Swarm scheduling must create the same Task, worktree, Thread, managed-process, quality, and review objects used by manual Terminal Workspace Tasks. Swarm does not receive a special terminal runtime.

## Alternatives considered

- Store a terminal-only Task record with each pane.
- Treat provider Threads as the durable unit of engineering work.
- Recalculate ownership, diff, and review readiness entirely in the renderer.

All three alternatives were rejected because they duplicate canonical state or make provider replacement and restart recovery ambiguous.
